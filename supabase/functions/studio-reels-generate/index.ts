// studio-reels-generate — Start Veo 3.1 long-running job on Vertex AI. Returns operation_name for polling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { getVertexCreds, getVertexAccessToken } from "../_shared/vertexAuth.ts";
import { checkMemeSubscription } from "../_shared/memeSubscriptionCheck.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

const VEO_MODEL = "veo-3.1-generate-preview";
const LOCATION = "us-central1";
const VEO_OUTPUT_BUCKET = Deno.env.get("VEO_OUTPUT_BUCKET"); // e.g. gs://theraiapi-veo-output

interface ReelsGenerateRequest {
    /** Optional: use this verbatim as the Veo prompt (e.g. from LLM script). */
    prompt?: string;
    target_names?: string;
    context_description?: string;
    reference_images_base64?: string[];
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
        const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: CORS_HEADERS,
            });
        }

        // Subscription + usage gate
        const subCheck = await checkMemeSubscription(user.id, "reels");
        if (!subCheck.allowed) {
            return new Response(JSON.stringify({ error: subCheck.error ?? "Subscription required" }), {
                status: subCheck.statusCode ?? 403,
                headers: CORS_HEADERS,
            });
        }

        const creds = getVertexCreds();
        if (!creds) {
            return new Response(JSON.stringify({ error: "Video generation not configured" }), {
                status: 503,
                headers: CORS_HEADERS,
            });
        }

        const body = (await req.json()) as ReelsGenerateRequest;
        const { prompt: directPrompt, target_names, context_description, reference_images_base64 } = body;

        const refImages = reference_images_base64?.slice(0, 3) ?? [];
        const prompt = directPrompt?.trim()
            ?? [target_names?.trim(), context_description?.trim()].filter(Boolean).join(". ");
        if (!prompt) {
            return new Response(JSON.stringify({ error: "prompt or (target_names + context_description) required" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }

        const instance: Record<string, unknown> = { prompt };
        if (refImages.length > 0) {
            instance.referenceImages = refImages.map((bytesBase64Encoded) => ({
                image: { bytesBase64Encoded, mimeType: "image/jpeg" },
                referenceType: "asset",
            }));
        }

        if (!VEO_OUTPUT_BUCKET) {
            return new Response(
                JSON.stringify({ error: "VEO_OUTPUT_BUCKET is not configured. Please set this Supabase secret." }),
                { status: 503, headers: CORS_HEADERS }
            );
        }

        const requestBody: Record<string, unknown> = {
            instances: [instance],
            parameters: {
                aspectRatio: "9:16",
                durationSeconds: 8,
                resolution: "720p",
                personGeneration: "allow_adult",
                generateAudio: false,
                // GCS output directory — Veo writes large videos here instead of returning bytes inline
                storageUri: `${VEO_OUTPUT_BUCKET}/reels/${user.id}/`,
            },
        };

        const accessToken = await getVertexAccessToken(creds);
        const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${creds.project_id}/locations/${LOCATION}/publishers/google/models/${VEO_MODEL}:predictLongRunning`;

        const resp = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        const data = await resp.json();
        if (!resp.ok) {
            console.error("Veo start error:", resp.status, data);
            return new Response(
                JSON.stringify({ error: data?.error?.message ?? "Failed to start video generation" }),
                { status: resp.status >= 500 ? 502 : 400, headers: CORS_HEADERS }
            );
        }

        const operationName = data.name;
        if (!operationName) {
            return new Response(JSON.stringify({ error: "No operation name in response" }), {
                status: 502,
                headers: CORS_HEADERS,
            });
        }

        return new Response(
            JSON.stringify({ operation_name: operationName }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (err) {
        console.error("studio-reels-generate error:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
