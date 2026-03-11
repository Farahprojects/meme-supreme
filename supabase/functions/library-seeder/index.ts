// library-seeder — Dev-only: generates meme image + caption, saves to library_images + library-images bucket (no VPS, no credits)

import { createPooledClient } from "../_shared/supabaseClient.ts";
import { MistralService } from "../_shared/mistralService.ts";
import { buildMemeRoastPrompt, STYLES } from "../_shared/memePromptBuilder.ts";
import { generateAndUploadRawImage } from "../_shared/imageHelper.ts";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dev-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
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
    } catch {
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

interface LibrarySeederRequest {
    target_names: string;
    context_description: string;
    tone?: string;
    dev_secret?: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    try {
        const body: LibrarySeederRequest = await req.json();
        const devSecret = body.dev_secret ?? req.headers.get("x-dev-secret") ?? "";
        const expectedSecret = Deno.env.get("DEV_SEEDER_SECRET");

        if (!expectedSecret || devSecret !== expectedSecret) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: CORS_HEADERS }
            );
        }

        const { target_names, context_description, tone } = body;
        if (!target_names?.trim() || !context_description?.trim()) {
            return new Response(
                JSON.stringify({ error: "Missing target_names or context_description" }),
                { status: 400, headers: CORS_HEADERS }
            );
        }

        if (target_names.length > 200 || context_description.length > 1000) {
            return new Response(
                JSON.stringify({ error: "target_names or context_description too long" }),
                { status: 400, headers: CORS_HEADERS }
            );
        }

        const normalizedTone = (tone || "roast").toLowerCase();
        if (!["roast", "funny", "sweet", "bold"].includes(normalizedTone)) {
            return new Response(
                JSON.stringify({ error: "Invalid tone; use roast, funny, sweet, or bold" }),
                { status: 400, headers: CORS_HEADERS }
            );
        }

        const supabase = createPooledClient();

        let selectedStyle = STYLES.y2k;
        if (normalizedTone === "bold") selectedStyle = STYLES.fashion;
        else if (normalizedTone === "sweet") selectedStyle = STYLES.cinematic;

        const fullPrompt = buildMemeRoastPrompt(
            target_names.trim(),
            context_description.trim(),
            undefined,
            normalizedTone,
            selectedStyle
        );

        const mistralService = new MistralService();
        const mistralResult = await mistralService.generateContent(
            [{ role: "user", parts: [{ text: fullPrompt }] }],
            undefined,
            { model: "mistral-medium-latest", temperature: 1.0, maxOutputTokens: 2048 }
        );

        const { caption, imagePrompt } = parseMistralResponse(mistralResult.text?.trim() ?? "");

        let publicUrl: string;
        try {
            const result = await generateAndUploadRawImage(
                supabase,
                imagePrompt,
                "library",
                "meme",
                "library-images"
            );
            publicUrl = result.publicUrl;
        } catch (imgErr) {
            if (imgErr instanceof Error && imgErr.message === "CONTENT_POLICY_VIOLATION") {
                return new Response(
                    JSON.stringify({ error: "Image content was rejected. Try different context or tone." }),
                    { status: 400, headers: CORS_HEADERS }
                );
            }
            throw imgErr;
        }

        const { data: row, error: insertError } = await supabase
            .from("library_images")
            .insert({
                image_url: publicUrl,
                tone: normalizedTone,
                caption,
                names: target_names.trim() || null,
                is_published: true,
            })
            .select("id")
            .single();

        if (insertError) {
            console.error("[library-seeder] Insert error:", insertError);
            return new Response(
                JSON.stringify({ error: "Failed to save to library" }),
                { status: 500, headers: CORS_HEADERS }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                id: row.id,
                image_url: publicUrl,
                caption,
                names: target_names.trim() || null,
                tone: normalizedTone,
            }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (error) {
        console.error("[library-seeder] Error:", error);
        const message = error instanceof Error ? error.message : "Internal error";
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
