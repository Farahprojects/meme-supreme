// studio-reels-extend — Start Veo 3.1 extension job: 7s continuation of an existing 8s Veo-generated video.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { getVertexCreds, getVertexAccessToken } from "../_shared/vertexAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const VEO_OUTPUT_BUCKET = Deno.env.get("VEO_OUTPUT_BUCKET");

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

const VEO_MODEL = "veo-3.1-generate-preview";
const LOCATION = "us-central1";

interface ReelsExtendRequest {
    /** GCS URI of the part-1 video (gs://bucket/path). Preferred — avoids downloading the video. */
    video_gcs_uri?: string;
    /** Public URL fallback if GCS URI is unavailable (will be downloaded and re-encoded). */
    video_url?: string;
    /** Prompt for the 7s continuation. */
    prompt: string;
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

        const creds = getVertexCreds();
        if (!creds) {
            return new Response(JSON.stringify({ error: "Video extension not configured" }), {
                status: 503,
                headers: CORS_HEADERS,
            });
        }

        if (!VEO_OUTPUT_BUCKET) {
            return new Response(
                JSON.stringify({ error: "VEO_OUTPUT_BUCKET is not configured." }),
                { status: 503, headers: CORS_HEADERS }
            );
        }

        const body = (await req.json()) as ReelsExtendRequest;
        const { video_gcs_uri, video_url, prompt: promptText } = body;

        if (!promptText?.trim()) {
            return new Response(JSON.stringify({ error: "prompt is required" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }
        if (!video_gcs_uri && !video_url) {
            return new Response(JSON.stringify({ error: "video_gcs_uri or video_url is required" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }

        // Build the video field: prefer GCS URI (no data transfer), fall back to base64 download
        let videoField: Record<string, string>;
        if (video_gcs_uri?.startsWith("gs://")) {
            videoField = { gcsUri: video_gcs_uri, mimeType: "video/mp4" };
        } else {
            // Fallback: download and base64-encode (only for non-GCS URLs)
            const videoResp = await fetch(video_url!, { method: "GET" });
            if (!videoResp.ok) {
                return new Response(
                    JSON.stringify({ error: "Failed to fetch part 1 video" }),
                    { status: 400, headers: CORS_HEADERS }
                );
            }
            const videoBytes = new Uint8Array(await videoResp.arrayBuffer());
            let base64 = "";
            const chunkSize = 8192;
            for (let i = 0; i < videoBytes.length; i += chunkSize) {
                const chunk = videoBytes.subarray(i, Math.min(i + chunkSize, videoBytes.length));
                base64 += String.fromCharCode(...chunk);
            }
            videoField = { bytesBase64Encoded: btoa(base64), mimeType: "video/mp4" };
        }

        const requestBody = {
            instances: [
                {
                    prompt: promptText.trim(),
                    video: videoField,
                },
            ],
            parameters: {
                durationSeconds: 7,
                aspectRatio: "9:16",
                resolution: "720p",
                sampleCount: 1,
                personGeneration: "allow_adult",
                generateAudio: false,
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

        const rawText = await resp.text();
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(rawText);
        } catch {
            console.error("Non-JSON Veo extend response:", resp.status, rawText.slice(0, 500));
            return new Response(
                JSON.stringify({ error: `Unexpected response from video API (${resp.status})` }),
                { status: 502, headers: CORS_HEADERS }
            );
        }

        if (!resp.ok) {
            console.error("Veo extend error:", resp.status, data);
            return new Response(
                JSON.stringify({ error: (data as { error?: { message?: string } })?.error?.message ?? "Failed to start video extension" }),
                { status: resp.status >= 500 ? 502 : 400, headers: CORS_HEADERS }
            );
        }

        const operationName = (data as { name?: string }).name;
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
        console.error("studio-reels-extend error:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
