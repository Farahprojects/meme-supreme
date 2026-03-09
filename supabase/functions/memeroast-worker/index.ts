// memeroast-worker (Adapter) - Orchestrates MemeRoast-specific meme generation (Context-based)
// Flow: Direct user context → Format Prompt → generate-meme (Core) → Update memeroast_images DB

import { createPooledClient } from "../_shared/supabaseClient.ts";
import { getInternalCallHeaders } from "../_shared/authHelper.ts";
import { MistralService } from "../_shared/mistralService.ts";

const retryWithBackoff = async <T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = baseDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retries exceeded');
};

function parseMistralResponse(responseText: string, requestId: string): { caption: string; imagePrompt: string } {
    if (!responseText) throw new Error('Empty response from Mistral');

    let raw = responseText.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const repaired = raw
        .replace(/\\'/g, "'")
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/,\s*([}\]])/g, '$1');

    try {
        const parsed = JSON.parse(repaired);
        if (!parsed.caption || !parsed.imagePrompt) throw new Error('Missing caption or imagePrompt');
        return parsed;
    } catch (_first) {
        const captionMatch = repaired.match(/"caption"\s*:\s*"(.*)"\s*,\s*"imagePrompt"/s);
        const imagePromptMatch = repaired.match(/"imagePrompt"\s*:\s*"(.*)"\s*[}\]]/s);
        if (captionMatch && imagePromptMatch) {
            const caption = captionMatch[1].replace(/\\"/g, '"').trim();
            const imagePrompt = imagePromptMatch[1].replace(/\\"/g, '"').trim();
            if (caption && imagePrompt) {
                console.warn(`[${requestId}] Used fallback extraction`);
                return { caption, imagePrompt };
            }
        }
        console.error(`[${requestId}] Parse error:`, _first);
        throw new Error('Failed to parse LLM response');
    }
}

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createPooledClient();

const STYLES = {
    y2k: "Y2K Flash / Retro Digicam. Nostalgic and playful: disposable camera aesthetic, flash blown out, slightly messy, early 2000s digicam. Harsh on-camera flash, overexposed highlights, grain, candid snapshot energy.",
    fashion: "High-End Editorial Fashion Shoot. Ultra-sharp, premium studio lighting, dramatic shadows, glossy magazine aesthetic, hyper-detailed, bold fashion styling, confident posture, cinematic 8k resolution.",
    cinematic: "Cinematic Dreamy Portrait. Soft beautiful lighting, golden hour glow or gentle diffused studio light, sharp focus on subject with shallow depth of field (bokeh background), warm and inviting atmosphere, highly detailed.",
};

interface MemeRoastRequest {
    session_id?: string;
    order_id?: string; // Fallback for old requests
    product_type: string;
    target_names: string;
    context_description: string;
    tone?: string;
    optional_date?: string;
    request_id?: string;
}

function buildMemeRoastPrompt(targetNames: string, contextDescription: string, optionalDate: string | undefined, tone: string = 'roast', styleDescription: string): string {
    const signInfo = optionalDate ? `
Birth Data: ${optionalDate}
[ASTROLOGY INSTRUCTION: Birth data was provided! Infer their likely astrological sign and placements based on this date. CRITICAL: DO NOT use any direct astrology jargon in the final output (e.g., do not say "Scorpio", "Mercury", "Venus", "Retrograde", "Moon sign"). Translate the astrological placements into personality traits that fit the requested Tone.]` : '';

    let toneRules = "";
    tone = tone.toLowerCase();

    if (tone === "roast") {
        toneRules = `
- Based on the user's provided context, write a meme caption that ruthlessly (but playfully) roasts the target(s).
- SAFETY GUARD (CRITICAL): Never attack physical appearance, immutable traits (race, body, hair, age, etc.), core identity, trauma, mental health, competence in a demeaning way, or worth as a person.
- ALLOWED ROASTS: Playful exaggeration of habits, over-the-top confidence, boss energy theatrics, situational quirks, and harmless ego inflation jokes.
- Light roast is expected. Never genuinely cruel or hate-speech.`;
    } else if (tone === "funny") {
        toneRules = `
- Based on the user's provided context, write a highly relatable and hilarious meme caption about the target(s).
- Focus on situational comedy, lighthearted internet humor, and relatable daily struggles.
- Keep it goofy, chaotic but completely harmless.`;
    } else if (tone === "sweet") {
        toneRules = `
- Based on the user's provided context, write a wholesome, pure, and uplifting meme caption about the target(s).
- Highlight cute quirks, endearing personality traits, and positive vibes.
- Make the target feel appreciated, loved, and seen in a heartwarming way.`;
    } else if (tone === "bold") {
        toneRules = `
- Based on the user's provided context, write a meme caption dripping with extreme confidence, main character energy, and slight (but fun) unhinged vibes for the target(s).
- Focus on them being loud, unapologetic, an absolute unit, or completely dominating a situation.
- High energy, dramatic flair. No self-deprecation allowed here.`;
    } else {
        // Fallback or custom
        toneRules = `
- Based on the user's provided context, write a meme caption that captures the requested tone: ${tone}.`;
    }

    return `You are an expert modern meme creator. Return ONLY strict JSON.

TARGET(S): ${targetNames}${signInfo}
REQUESTED TONE: ${tone.toUpperCase()}

USER PROVIDED CONTEXT FOR THE MEME:
"${contextDescription}"

SCENE STYLE (locked; must be followed exactly):
${styleDescription}

RULES:${toneRules}
- Caption must read like a modern internet meme.
- No hashtags, no emojis.
- Then: Generate an image prompt that makes the caption land perfectly.
- Image must be a LITERAL scene that matches the joke and the tone. No text in the image.
- Describe concrete objects + actions + facial expressions + setting based on the context.
- 3:4 portrait, full-bleed edge-to-edge. No borders/frames.

OUTPUT FORMAT:
{
  "caption": "your caption (<=15 words)",
  "imagePrompt": "STYLE: [repeat the style in your own words] | SETTING: [specific place] | PEOPLE: [${targetNames}] | ACTION: [what they are doing] | EXPRESSIONS: [faces] | PROPS: [key objects] | CAMERA: [shot type, lens vibe] | LIGHTING: [matches style] | COMPOSITION: 3:4 vertical, full-bleed edge-to-edge, subject in focus, no text"
}`;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    const startTime = Date.now();
    let requestId = crypto.randomUUID().substring(0, 8);

    try {
        const body: MemeRoastRequest = await req.json();
        requestId = body.request_id || requestId;
        const { product_type, target_names, context_description, tone, optional_date } = body;

        const session_id = body.session_id || body.order_id;

        if (!session_id || !product_type || !target_names || !context_description) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: CORS_HEADERS });
        }

        if (session_id.startsWith('test-')) {
            console.log(`[${requestId}] Bypassing payment check for test order: ${session_id}`);
        } else {
            // 1. Verify Credits in memesupreme_credits
            const { data: creditData, error: creditLookupError } = await supabase
                .from('memesupreme_credits')
                .select('credits_remaining')
                .eq('session_id', session_id)
                .single();

            if (creditLookupError || !creditData) {
                console.error(`[${requestId}] Credit record not found for session: ${session_id}`, creditLookupError);
                return new Response(JSON.stringify({ error: "No credits available. Please purchase a pack." }), { status: 402, headers: CORS_HEADERS });
            }

            if (creditData.credits_remaining <= 0) {
                console.warn(`[${requestId}] Session ${session_id} has zero credits.`);
                return new Response(JSON.stringify({ error: "Insufficient credits. Please purchase a pack." }), { status: 402, headers: CORS_HEADERS });
            }

            // Deduct 1 credit immediately
            const { error: deductError } = await supabase
                .from('memesupreme_credits')
                .update({
                    credits_remaining: creditData.credits_remaining - 1,
                    updated_at: new Date().toISOString()
                })
                .eq('session_id', session_id)
                .gt('credits_remaining', 0); // concurrency safety

            if (deductError) {
                console.error(`[${requestId}] Failed to deduct credit:`, deductError);
                return new Response(JSON.stringify({ error: "Failed to deduct credit, try again" }), { status: 409, headers: CORS_HEADERS });
            }
            console.log(`[${requestId}] Successfully deducted 1 credit from session ${session_id}`);
        }

        // 2. Initial Insert into Tracking Table (memeroast_images)
        const { error: insertError } = await supabase
            .from('memeroast_images')
            .insert({
                session_id,
                product_type,
                target_names,
                context_description,
                optional_sign: optional_date ? optional_date.trim() : null, // keep backward compat in DB
                status: 'processing', // ONLY USE STRICT STATES NOW
                source: 'memeroast'
            });

        if (insertError) {
            console.error(`[${requestId}] Failed to insert tracking record:`, insertError);
            throw new Error(`Failed to insert tracking record: ${insertError.message}`);
        }

        // Determine style based on requested tone
        let selectedStyle = STYLES.y2k;
        const normalizedTone = (tone || 'roast').toLowerCase();
        if (normalizedTone === 'bold') {
            selectedStyle = STYLES.fashion;
        } else if (normalizedTone === 'sweet') {
            selectedStyle = STYLES.cinematic;
        }

        // 3. Format Prompt
        const fullPrompt = buildMemeRoastPrompt(target_names, context_description, optional_date, normalizedTone, selectedStyle);

        // 4. Call Mistral directly (Bypass generate-meme core)
        const mistralService = new MistralService();
        const mistralResult = await retryWithBackoff(() =>
            mistralService.generateContent(
                [{ role: "user", parts: [{ text: fullPrompt }] }],
                undefined,
                {
                    model: "mistral-medium-latest",
                    temperature: 1.0,
                    maxOutputTokens: 2048
                }
            )
        );

        const coreData = parseMistralResponse(mistralResult.text?.trim() || '', requestId);

        // We NO LONGER update status during steps like generating_image or processing_overlay

        // 5. Generate Raw Image & Upload to Storage
        const { generateAndUploadRawImage } = await import('../_shared/imageHelper.ts');
        const { publicUrl, filePath, imageId } = await generateAndUploadRawImage(
            supabase,
            coreData.imagePrompt,
            session_id, // acting as user/folder ID
            'meme',
            'generated-images'
        );

        // 6. Await VPS Overlay
        const VPS_URL = Deno.env.get("VPS_WORKERS_URL");
        const VPS_SECRET = Deno.env.get("VPS_SECRET");
        let overlaySuccess = false;
        let finalImageUrl = publicUrl;

        if (VPS_URL && VPS_SECRET) {
            try {
                const vpsResp = await fetch(`${VPS_URL}/workers/overlay-buffer`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-vps-secret": VPS_SECRET },
                    body: JSON.stringify({
                        image_url: publicUrl,
                        meme_metadata: {
                            names: target_names,
                            caption: coreData.caption,
                            theme: 'Roast',
                            watermark: 'www.memesupreme.co'
                        }
                    }),
                });

                if (!vpsResp.ok) {
                    console.error(`[${requestId}] VPS overlay error status:`, vpsResp.status);
                    throw new Error("VPS returned failed status");
                }

                const vpsData = await vpsResp.json();
                if (vpsData.success && vpsData.image_base64) {
                    // Decode base64 to Uint8Array
                    const binary = atob(vpsData.image_base64);
                    const imageBytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        imageBytes[i] = binary.charCodeAt(i);
                    }

                    // Upload the overlaid image back to Supabase Storage, overwriting the raw one
                    const { error: uploadError } = await supabase.storage
                        .from('generated-images')
                        .upload(filePath, imageBytes, {
                            contentType: 'image/jpeg',
                            cacheControl: 'public, max-age=31536000, immutable',
                            upsert: true,
                        });

                    if (uploadError) {
                        console.error(`[${requestId}] Failed to upload overlaid image to Supabase:`, uploadError);
                        throw new Error("Supabase upload failed");
                    }

                    // Append cache buster to force UI refresh
                    finalImageUrl = `${publicUrl}?v=${Date.now()}`;
                    overlaySuccess = true;
                    console.log(`[${requestId}] VPS overlay completed and uploaded successfully!`);
                } else {
                    console.error(`[${requestId}] VPS overlay unsuccessful:`, vpsData);
                    throw new Error("VPS payload missing success or base64 data");
                }
            } catch (vpsErr) {
                console.error(`[${requestId}] VPS overlay fetch dynamically failed:`, vpsErr);
                throw new Error("VPS Request failed completely");
            }
        } else {
            console.warn(`[${requestId}] No VPS URL/Secret. Saving raw image.`);
            overlaySuccess = true; // Still marking true so we show the raw image
        }

        // 7. Finalize Job Status
        await supabase.from('memeroast_images').update({
            status: 'complete',
            generated_caption: coreData.caption,
            image_url: finalImageUrl,
            updated_at: new Date().toISOString()
        }).eq('session_id', session_id);

        // 8. Return to the Client
        return new Response(
            JSON.stringify({
                success: true,
                session_id: session_id,
                status: 'complete',
                message: 'Image processing finalized',
                processing_time_ms: Date.now() - startTime
            }),
            { status: 200, headers: CORS_HEADERS }
        );

    } catch (error) {
        console.error(`[${requestId}] Error:`, error);

        // Mark as failed in DB
        let sessionIdExtract: string | null = null;
        try {
            const body = await req.clone().json();
            sessionIdExtract = body.session_id || body.order_id;
        } catch (_) { }

        if (sessionIdExtract) {
            // Refund credit if not a test order
            if (!sessionIdExtract.startsWith('test-')) {
                try {
                    const { data: currentCreds } = await supabase
                        .from('memesupreme_credits')
                        .select('credits_remaining')
                        .eq('session_id', sessionIdExtract)
                        .single();
                    if (currentCreds) {
                        await supabase
                            .from('memesupreme_credits')
                            .update({
                                credits_remaining: currentCreds.credits_remaining + 1,
                                updated_at: new Date().toISOString()
                            })
                            .eq('session_id', sessionIdExtract);
                        console.log(`[${requestId}] Refunded 1 credit to session ${sessionIdExtract}`);
                    }
                } catch (refundErr) {
                    console.error(`[${requestId}] Failed to refund credit:`, refundErr);
                }
            }
            // Check if it's our specific policy violation
            if (error instanceof Error && error.message === "CONTENT_POLICY_VIOLATION") {
                console.error(`[${requestId}] 🛑 CONTENT POLICY VIOLATION TRIGGERED 🛑`);
                console.error(`[${requestId}] Prompt that caused rejection:`, (error as any).promptUsed || "Prompt not attached to error");

                await supabase.from('memeroast_images').update({
                    status: 'failed',
                    error_reason: 'policy_violation', // if schema supports it, otherwise generic failed
                    updated_at: new Date().toISOString()
                }).eq('session_id', sessionIdExtract);

                return new Response(JSON.stringify({
                    error: "The meme you tried to create is not allowed. Please read our terms and policies.",
                    error_type: "policy_violation"
                }), { status: 400, headers: CORS_HEADERS });
            }

            await supabase.from('memeroast_images').update({
                status: 'failed',
                updated_at: new Date().toISOString()
            }).eq('session_id', sessionIdExtract);
        }

        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }), { status: 500, headers: CORS_HEADERS });
    }
});
