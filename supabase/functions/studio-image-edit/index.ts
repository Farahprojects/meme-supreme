// studio-image-edit — Edit an existing studio image using Imagen's editImage API.
// User provides an edit instruction ("make hair blonde", "add red jacket");
// we download the original image, pass it to Imagen 3 editing, upload the result.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.1.0?target=deno&no-dts&deps=std@0.224.0";
import { createPooledClient } from "../_shared/supabaseClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const GOOGLE_API_KEY = Deno.env.get("GOOGLE-MEME");

// Imagen 3 editing model (Imagen 4 has no edit model)
const EDIT_MODEL = "imagen-3.0-capability-001";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

function decodeBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

interface StudioImageEditRequest {
    image_url: string;
    edit_instruction: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
        // JWT auth
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
        const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: CORS_HEADERS,
            });
        }

        if (!GOOGLE_API_KEY) {
            return new Response(JSON.stringify({ error: "Image editing unavailable" }), {
                status: 503,
                headers: CORS_HEADERS,
            });
        }

        const body = (await req.json()) as StudioImageEditRequest;
        const { image_url, edit_instruction } = body;

        if (!image_url || !edit_instruction?.trim()) {
            return new Response(
                JSON.stringify({ error: "image_url and edit_instruction are required" }),
                { status: 400, headers: CORS_HEADERS }
            );
        }
        if (edit_instruction.length > 500) {
            return new Response(
                JSON.stringify({ error: "Edit instruction too long (max 500 characters)" }),
                { status: 400, headers: CORS_HEADERS }
            );
        }

        // Fetch the original image and convert to base64
        const imageResp = await fetch(image_url);
        if (!imageResp.ok) {
            return new Response(JSON.stringify({ error: "Failed to fetch original image" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }
        const imageBuffer = await imageResp.arrayBuffer();
        const imageBytes = new Uint8Array(imageBuffer);
        let binary = "";
        for (let i = 0; i < imageBytes.length; i++) {
            binary += String.fromCharCode(imageBytes[i]);
        }
        const base64Original = btoa(binary);

        // Call Imagen editImage
        const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
        const editResp = await genAI.models.editImage({
            model: EDIT_MODEL,
            prompt: `${edit_instruction.trim()}. Keep the overall scene, composition, lighting, and people identical. Only apply the requested change. Full-bleed portrait image, no borders or frames.`,
            referenceImages: [
                {
                    referenceType: "REFERENCE_TYPE_RAW",
                    referenceId: 1,
                    referenceImage: {
                        imageBytes: base64Original,
                    },
                },
            ],
            config: {
                numberOfImages: 1,
                personGeneration: "allow_adult",
            },
        });

        const resultBytes = editResp.generatedImages?.[0]?.image?.imageBytes;
        if (!resultBytes) {
            return new Response(
                JSON.stringify({ error: "Edit was blocked or failed. Try a different instruction." }),
                { status: 400, headers: CORS_HEADERS }
            );
        }

        // Upload edited image to studio-images bucket
        const supabase = createPooledClient();
        const timestamp = Date.now();
        const imageId = crypto.randomUUID();
        const filePath = `${user.id}/${timestamp}-${imageId}.jpg`;
        const editedBytes = decodeBase64(resultBytes);

        const CUSTOM_DOMAIN = Deno.env.get("CUSTOM_DOMAIN") || Deno.env.get("SUPABASE_URL");
        const publicUrl = `${CUSTOM_DOMAIN}/storage/v1/object/public/studio-images/${filePath}`;

        const { error: uploadError } = await supabase.storage
            .from("studio-images")
            .upload(filePath, editedBytes, {
                contentType: "image/jpeg",
                cacheControl: "public, max-age=31536000, immutable",
            });

        if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
        }

        return new Response(
            JSON.stringify({ image_url: publicUrl }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (error) {
        console.error("studio-image-edit error:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
