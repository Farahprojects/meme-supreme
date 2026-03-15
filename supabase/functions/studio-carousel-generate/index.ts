// studio-carousel-generate — One Mistral call for 6 slides, then 6 sequential Imagen calls.
// JWT auth, subscription check (6 images), save to studio_carousels + studio_memes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { createPooledClient } from "../_shared/supabaseClient.ts";
import { checkMemeSubscription } from "../_shared/memeSubscriptionCheck.ts";
import { MistralService } from "../_shared/mistralService.ts";
import { buildCarouselPrompt, CAROUSEL_SYSTEM_INSTRUCTION } from "../_shared/carouselPromptBuilder.ts";
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

function parseCarouselResponse(responseText: string): { slide_text: string; imagePrompt: string }[] {
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
        const slides = parsed?.slides;
        if (!Array.isArray(slides) || slides.length !== 6) throw new Error("Expected exactly 6 slides");
        for (let i = 0; i < 6; i++) {
            const s = slides[i];
            if (!s?.slide_text || !s?.imagePrompt) throw new Error(`Slide ${i + 1} missing slide_text or imagePrompt`);
        }
        return slides.map((s: { slide_text: string; imagePrompt: string }) => ({
            slide_text: String(s.slide_text).trim(),
            imagePrompt: String(s.imagePrompt).trim(),
        }));
    } catch (e) {
        throw new Error(`Failed to parse carousel response: ${e instanceof Error ? e.message : String(e)}`);
    }
}

interface CarouselRequest {
    format: "teach" | "story" | "authority";
    context_description: string;
    tone: string;
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

        // Subscription: need 6 image slots
        const subCheck = await checkMemeSubscription(user.id, "images", 6);
        if (!subCheck.allowed) {
            return new Response(JSON.stringify({ error: subCheck.error ?? "Subscription required" }), {
                status: subCheck.statusCode ?? 403,
                headers: CORS_HEADERS,
            });
        }

        const body = (await req.json()) as CarouselRequest;
        const { format, context_description, tone, reference_image_base64 } = body;

        if (!format || !["teach", "story", "authority"].includes(format)) {
            return new Response(JSON.stringify({ error: "format must be teach, story, or authority" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }
        if (!context_description?.trim()) {
            return new Response(JSON.stringify({ error: "context_description is required" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }
        if (!tone?.trim()) {
            return new Response(JSON.stringify({ error: "tone is required" }), {
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
        if (context_description.length > 1000) {
            return new Response(JSON.stringify({ error: "context_description max 1000 characters" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }

        const fullPrompt = buildCarouselPrompt(format, context_description.trim(), normalizedTone);
        const mistralService = new MistralService();
        const mistralResult = await retryWithBackoff(() =>
            mistralService.generateContent(
                [{ role: "user", parts: [{ text: fullPrompt }] }],
                CAROUSEL_SYSTEM_INSTRUCTION,
                {
                    model: "mistral-medium-latest",
                    temperature: 1.0,
                    topP: 0.95,
                    presencePenalty: 0.15,
                    frequencyPenalty: 0.15,
                    maxOutputTokens: 4096,
                }
            )
        );

        const slides = parseCarouselResponse(mistralResult.text?.trim() || "");

        const supabase = createPooledClient();

        // Insert carousel row first
        const { data: carouselRow, error: carouselErr } = await supabase
            .from("studio_carousels")
            .insert({
                user_id: user.id,
                format,
                context_description: context_description.trim(),
                tone: normalizedTone,
            })
            .select("id")
            .single();

        if (carouselErr || !carouselRow) {
            console.error("studio_carousels insert error:", carouselErr);
            return new Response(JSON.stringify({ error: "Failed to save carousel" }), {
                status: 500,
                headers: CORS_HEADERS,
            });
        }
        const carouselId = carouselRow.id;

        // Generate and save each slide sequentially
        const resultSlides: { slide_index: number; slide_text: string; image_url: string }[] = [];

        for (let i = 0; i < 6; i++) {
            const slide = slides[i];
            const { publicUrl } = await retryWithBackoff(() =>
                generateAndUploadRawImage(
                    supabase,
                    slide.imagePrompt,
                    user.id,
                    "meme",
                    "studio-images",
                    reference_image_base64,
                    "main subject"
                )
            );

            const { error: memeErr } = await supabase.from("studio_memes").insert({
                user_id: user.id,
                carousel_id: carouselId,
                slide_index: i,
                caption: slide.slide_text,
                image_url: publicUrl,
                tone: normalizedTone,
            });

            if (memeErr) {
                console.error(`studio_memes insert for slide ${i}:`, memeErr);
                return new Response(JSON.stringify({ error: "Failed to save slide" }), {
                    status: 500,
                    headers: CORS_HEADERS,
                });
            }

            resultSlides.push({ slide_index: i, slide_text: slide.slide_text, image_url: publicUrl });
        }

        // Increment usage counter by 6 (one per slide) — non-blocking, fail silently
        supabase.rpc("increment_subscription_counter", {
            p_user_id: user.id,
            p_column: "images_used",
            p_amount: 6,
        }).then(({ error: rpcErr }) => {
            if (rpcErr) console.error("increment_subscription_counter error:", rpcErr);
        });

        return new Response(
            JSON.stringify({
                carousel_id: carouselId,
                slides: resultSlides,
            }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_POLICY_VIOLATION") {
            return new Response(
                JSON.stringify({ error: "The carousel content you tried to create is not allowed." }),
                { status: 400, headers: CORS_HEADERS }
            );
        }
        console.error("studio-carousel-generate error:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
