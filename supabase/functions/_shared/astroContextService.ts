// supabase/functions/_shared/astroContextService.ts
// Note: This service uses the supabase client passed from the caller (chat-send)
// to avoid duplicate imports and ensure consistent client configuration.
import { getSwissData } from "./getSwissData.ts";

/**
 * optimises swiss data for context injection
 */
export function optimizeSwissData(data: any): any {
    if (!data || typeof data !== 'object') {
        return data;
    }

    function processNode(node: any): any {
        if (node === null || typeof node !== 'object') {
            return node;
        }

        if (Array.isArray(node)) {
            return node.map(item => processNode(item));
        }

        const keys = Object.keys(node);

        // PATTERN 1: Simple {deg, sign} object -> [deg, sign]
        if (keys.length === 2 && keys.includes('deg') && keys.includes('sign')) {
            return [node.deg, node.sign];
        }

        // --- NEW LOGIC for complex objects (like planets) ---
        const optimizedObj: { [key: string]: any } = {};

        // Check if the complex object has position data to combine
        if (keys.includes('deg') && keys.includes('sign')) {
            optimizedObj.pos = [node.deg, node.sign]; // Use a new key 'pos' for the array
        }

        // Process all other keys, abbreviating them and skipping the original deg/sign
        for (const [key, value] of Object.entries(node)) {
            if (key === 'deg' || key === 'sign') {
                continue; // Skip the original keys as they've been combined
            }

            let newKey = key;
            switch (key) {
                case 'retrograde':
                    newKey = 'r';
                    break;
                case 'house_system':
                    newKey = 'hs';
                    break;
                case 'zodiac_type':
                    newKey = 'zt';
                    break;
                case 'type':
                    newKey = 't';
                    break;
            }
            optimizedObj[newKey] = processNode(value);
        }
        return optimizedObj;
    }

    // Single-pass read-only transform (processNode never mutates input)
    return processNode(data);
}

/**
 * Ensures that the correct Astro data context exists in the messages table
 * for the given conversation.
 * 
 * Behaivor:
 * 1. Uses fast RPC to fetch all profile and astro data in one call.
 * 2. Formats data into a system message.
 * 3. Injects into database and invalidates LLM cache.
 */
export async function ensureAstroContext(
    supabase: any,
    chatId: string,
    requestId: string = "unknown",
    personAProfileId?: string,
    personBProfileId?: string,
    personAName?: string,
    personBName?: string
): Promise<boolean> {
    const logPrefix = `[ensureAstroContext][${requestId}]`;
    const startTime = Date.now();

    try {
        // 1. Fetch data via Fast RPC (direct user_profile_list lookup by profile ID - no translator_logs join)
        // Skip is determined by RPC already_injected; no separate conversation_caches check.
        if (!personAProfileId) {
            console.warn(`${logPrefix} ⚠️ person_a_profile_id required for Swiss fetch. Caller must pass.`);
            return false;
        }

        const t1 = Date.now();
        const { data: contextData, error: rpcError } = await supabase.rpc('get_context_injection_data', {
            p_chat_id: chatId,
            p_person_a_profile_id: personAProfileId,
            p_person_b_profile_id: personBProfileId || null
        });
        if (rpcError || !contextData) {
            console.error(`${logPrefix} RPC Failed:`, rpcError);
            return false;
        }

        // Skip storage fetch and re-inject when context already injected (e.g. only Gemini cache expired)
        if (contextData.already_injected === true) {
            return true;
        }

        const primary = contextData.primary;
        const secondary = contextData.secondary;


        if (!primary?.primary_swiss_url) {
            console.warn(`${logPrefix} ⚠️ No Primary Swiss Data URL found in RPC. Injection aborted.`);
            return true;
        }

        // Fetch Primary and Secondary from Storage in parallel (optimization)
        const t2 = Date.now();
        const [primarySwissData, secondarySwissData] = await Promise.all([
            getSwissData(supabase, primary.primary_swiss_url),
            secondary?.secondary_swiss_url ? getSwissData(supabase, secondary.secondary_swiss_url) : Promise.resolve(null)
        ]);

        if (!primarySwissData) {
            console.error(`${logPrefix} ❌ Failed to fetch primary Swiss data from storage: ${primary.primary_swiss_url}`);
            return false;
        }
        if (secondary?.secondary_swiss_url && !secondarySwissData) {
            console.warn(`${logPrefix} ⚠️ Failed to fetch secondary Swiss data from storage: ${secondary.secondary_swiss_url}`);
        }

        // 2. Build combined context
        let contextContent = "Astro data available for this conversation:\n\n";

        // --- SECTION: PRIMARY PERSON ---
        const pAName = personAName || primary.name || "Member";
        const pABirth = {
            birth_date: primary.birth_date,
            birth_time: primary.birth_time,
            birth_location: primary.birth_location,
            timezone: primary.timezone
        };

        contextContent += `### ${pAName.toUpperCase()}\n`;
        contextContent += `**Birth Details (Local Time):** ${JSON.stringify(pABirth)}\n`;
        // Compact JSON (no pretty-print) to reduce payload to DB and to Google context cache
        contextContent += `${JSON.stringify(optimizeSwissData(primarySwissData))}\n\n`;

        // --- SECTION: SECONDARY PERSON (If exists) ---
        if (secondarySwissData) {
            const pBName = personBName || secondary.name || "Partner";
            const pBBirth = {
                birth_date: secondary.birth_date,
                birth_time: secondary.birth_time,
                birth_location: secondary.birth_location,
                timezone: secondary.timezone
            };

            contextContent += `### ${pBName.toUpperCase()}\n`;
            contextContent += `**Birth Details (Local Time):** ${JSON.stringify(pBBirth)}\n`;
            contextContent += `${JSON.stringify(optimizeSwissData(secondarySwissData))}\n\n`;
        }

        // 3. Prepare System Message
        const contextMessageData = {
            chat_id: chatId,
            role: "system",
            text: contextContent,
            status: "complete",
            context_injected: true,
            meta: {
                injection_type: 'swiss_data',
                has_swiss_data: true,
                has_second_person: !!secondarySwissData,
                person_a_log_id: primary.latest_translator_log_id,
                person_b_log_id: secondary?.latest_translator_log_id || null,
                injection_timestamp: new Date().toISOString()
            }
        };

        // 4. Atomic Database Update (Delete Old + Invalidate Cache + Insert New)
        // We run these in parallel where possible, but delete must happen to avoid multi-system-msgs
        const t3 = Date.now();
        await Promise.all([
            supabase.from('messages').delete().eq('chat_id', chatId).eq('role', 'system'),
            supabase.from("conversation_caches").delete().eq("chat_id", chatId)
        ]);

        const { error: insertError } = await supabase.from("messages").insert(contextMessageData);

        if (insertError) {
            console.error(`${logPrefix} ❌ Failed to insert system message:`, insertError);
            return false;
        }

        return true;

    } catch (err) {
        console.error(`${logPrefix} ❌ Unexpected error in ensureAstroContext:`, err);
        return false;
    }
}
