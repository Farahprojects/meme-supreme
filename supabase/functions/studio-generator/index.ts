// studio-generator — One tone per call; frontend runs 4 in parallel.
// JWT auth, optional reference image → Gemini Vision, then Mistral + Imagen, save to studio_memes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { createPooledClient } from "../_shared/supabaseClient.ts";
import { checkMemeSubscription } from "../_shared/memeSubscriptionCheck.ts";
import { MistralService } from "../_shared/mistralService.ts";
import { buildMemeRoastPrompt, STYLES } from "../_shared/memePromptBuilder.ts";
import { generateAndUploadRawImage } from "../_shared/imageHelper.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

const retryWithBackoff = async <T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, i)));
        }
    }
    throw new Error("Max retries exceeded");
};

function parseMistralResponse(responseText: string): { caption: string; imagePrompt: string } {
    if (!responseText) throw new Error("Empty response from Mistral");
    let raw = responseText.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const repaired = raw
        .replace(/\\'/g, "'")
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/,\s*([}\]])/g, "$1");
    try {
        const parsed = JSON.parse(repaired);
        if (!parsed.caption || !parsed.imagePrompt) throw new Error("Missing caption or imagePrompt");
        return parsed;
    } catch (_) {
        const captionMatch = repaired.match(/"caption"\s*:\s*"(.*)"\s*,\s*"imagePrompt"/s);
        const imagePromptMatch = repaired.match(/"imagePrompt"\s*:\s*"(.*)"\s*[}\]]/s);
        if (captionMatch && imagePromptMatch) {
            const caption = captionMatch[1].replace(/\\"/g, '"').trim();
            const imagePrompt = imagePromptMatch[1].replace(/\\"/g, '"').trim();
            if (caption && imagePrompt) return { caption, imagePrompt };
        }
        throw new Error("Failed to parse LLM response");
    }
}

interface StudioGeneratorRequest {
    target_names: string;
    context_description: string;
    tone: string;
    optional_date?: string;
    reference_image_base64?: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
                status: 401,
                headers: CORS_HEADERS,
            });
        }
        const token = authHeader.replace("Bearer ", "").trim();

        if (!SUPABASE_ANON_KEY) {
            return new Response(JSON.stringify({ error: "Server configuration error" }), {
                status: 500,
                headers: CORS_HEADERS,
            });
        }
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });
        const {
            data: { user },
            error: userError,
        } = await supabaseAuth.auth.getUser(token);
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: CORS_HEADERS,
            });
        }

        // Subscription + usage gate
        const subCheck = await checkMemeSubscription(user.id, "images");
        if (!subCheck.allowed) {
            return new Response(JSON.stringify({ error: subCheck.error ?? "Subscription required" }), {
                status: subCheck.statusCode ?? 403,
                headers: CORS_HEADERS,
            });
        }

        const body = (await req.json()) as StudioGeneratorRequest;
        const { target_names, context_description, tone, optional_date, reference_image_base64 } = body;

        if (!target_names || !context_description || !tone) {
            return new Response(
                JSON.stringify({ error: "target_names, context_description, and tone are required" }),
                { status: 400, headers: CORS_HEADERS }
            );
        }
        if (target_names.length > 200) {
            return new Response(JSON.stringify({ error: "Names too long (max 200 characters)" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }
        if (context_description.length > 1000) {
            return new Response(JSON.stringify({ error: "Description too long (max 1000 characters)" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }

        const normalizedTone = tone.toLowerCase();
        if (!["roast", "funny", "sweet", "bold"].includes(normalizedTone)) {
            return new Response(JSON.stringify({ error: "tone must be roast, funny, sweet, or bold" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }

        // Fetch the last 10 captions this user has generated for this tone so we can
        // inject them as banned angles — forces the model away from its default punchlines.
        const supabaseAdmin = createPooledClient();
        const { data: pastMemes } = await supabaseAdmin
            .from("studio_memes")
            .select("caption")
            .eq("user_id", user.id)
            .eq("tone", normalizedTone)
            .order("created_at", { ascending: false })
            .limit(10);

        const pastCaptions = (pastMemes ?? [])
            .map((m: { caption: string }) => m.caption?.trim())
            .filter(Boolean);

        let selectedStyle = STYLES.y2k;
        if (normalizedTone === "bold") selectedStyle = STYLES.fashion;
        else if (normalizedTone === "sweet") selectedStyle = STYLES.cinematic;

        const fullPrompt = buildMemeRoastPrompt(
            target_names,
            context_description,
            optional_date?.trim() || undefined,
            normalizedTone,
            selectedStyle,
            pastCaptions
        );

        const SYSTEM_INSTRUCTION = `You are a sharp, irreverent meme writer with a finger on the pulse of internet culture. You think in subversions and unexpected angles — you never use the first obvious joke, you dig one level deeper to find the absurd truth that makes people say "why is this so accurate." You also write highly detailed, technically precise image prompts that produce cinematic, visually stunning results from AI image models. Return ONLY valid JSON — no markdown, no explanation, nothing else.`;

        const mistralService = new MistralService();
        const mistralResult = await retryWithBackoff(() =>
            mistralService.generateContent(
                [{ role: "user", parts: [{ text: fullPrompt }] }],
                SYSTEM_INSTRUCTION,
                {
                    model: "mistral-medium-latest",
                    temperature: 1.0,
                    topP: 0.95,
                    presencePenalty: 0.15,
                    frequencyPenalty: 0.15,
                    maxOutputTokens: 2048,
                }
            )
        );
        const { caption, imagePrompt } = parseMistralResponse(mistralResult.text?.trim() || "");

        const { publicUrl, imageId } = await generateAndUploadRawImage(
            supabaseAdmin,
            imagePrompt,
            user.id,
            "meme",
            "studio-images",
            reference_image_base64,
            "main subject"
        );

        const { data: row, error: insertError } = await supabaseAdmin
            .from("studio_memes")
            .insert({
                user_id: user.id,
                target_names: target_names.trim(),
                context_description: context_description.trim(),
                reference_description: reference_image_base64 ? "Provided via Vertex Reference Image" : null,
                tone: normalizedTone,
                image_url: publicUrl,
                caption,
                names: target_names.trim(),
            })
            .select("id")
            .single();

        if (insertError) {
            console.error("studio_memes insert error:", insertError);
            return new Response(JSON.stringify({ error: "Failed to save meme" }), {
                status: 500,
                headers: CORS_HEADERS,
            });
        }

        // Increment usage counter — non-blocking, fail silently
        supabaseAdmin.rpc("increment_subscription_counter", {
            p_user_id: user.id,
            p_column: "images_used",
            p_amount: 1,
        }).then(({ error: rpcErr }) => {
            if (rpcErr) console.error("increment_subscription_counter error:", rpcErr);
        });

        return new Response(
            JSON.stringify({
                meme_id: row.id,
                image_url: publicUrl,
                caption,
                tone: normalizedTone,
                names: target_names.trim(),
            }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_POLICY_VIOLATION") {
            return new Response(
                JSON.stringify({ error: "The meme you tried to create is not allowed." }),
                { status: 400, headers: CORS_HEADERS }
            );
        }
        console.error("studio-generator error:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
