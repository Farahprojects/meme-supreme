// studio-reels-status — Poll Veo long-running operation; when done, save to studio_videos and return public URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { getVertexCreds, getVertexAccessToken } from "../_shared/vertexAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const LOCATION = "us-central1";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

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
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!, {
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
            return new Response(JSON.stringify({ error: "Video generation not configured" }), {
                status: 503,
                headers: CORS_HEADERS,
            });
        }

        const body = (await req.json()) as { operation_name: string; description?: string; goal?: string; is_final?: boolean };
        const { operation_name, description, goal, is_final } = body;
        if (!operation_name?.trim()) {
            return new Response(JSON.stringify({ error: "operation_name is required" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }

        const accessToken = await getVertexAccessToken(creds);
        console.log("Polling operation:", operation_name);

        // Veo on Vertex AI requires POST :fetchPredictOperation, NOT GET /operations/...
        // Extract model path from operation name:
        // Format: projects/.../locations/.../publishers/google/models/veo-xxx/operations/yyy
        const modelPathMatch = operation_name.match(
            /(projects\/[^/]+\/locations\/[^/]+\/publishers\/[^/]+\/models\/[^/]+)\/operations\//
        );

        let pollUrl: string;
        let pollMethod = "POST";
        let pollBody: string | undefined;

        if (modelPathMatch) {
            const modelPath = modelPathMatch[1];
            pollUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/${modelPath}:fetchPredictOperation`;
            pollBody = JSON.stringify({ operationName: operation_name });
        } else {
            // Fallback: generic LRO GET
            pollUrl = operation_name.startsWith("http")
                ? operation_name
                : `https://${LOCATION}-aiplatform.googleapis.com/v1/${operation_name}`;
            pollMethod = "GET";
        }

        console.log("Poll URL:", pollUrl, "method:", pollMethod);

        const resp = await fetch(pollUrl, {
            method: pollMethod,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: pollBody,
        });

        // Safely read response — Vertex can return HTML on bad URLs
        const rawText = await resp.text();
        let op: Record<string, unknown>;
        try {
            op = JSON.parse(rawText);
        } catch {
            console.error("Non-JSON response from Vertex:", resp.status, rawText.slice(0, 500));
            return new Response(
                JSON.stringify({ error: `Unexpected response from video API (${resp.status})` }),
                { status: 502, headers: CORS_HEADERS }
            );
        }

        if (!resp.ok) {
            const errMsg = (op as { error?: { message?: string } })?.error?.message ?? "Failed to get operation status";
            console.error("Veo status error:", resp.status, op);
            return new Response(
                JSON.stringify({ error: errMsg }),
                { status: resp.status >= 500 ? 502 : 400, headers: CORS_HEADERS }
            );
        }

        if (!op.done) {
            return new Response(JSON.stringify({ done: false }), {
                status: 200,
                headers: CORS_HEADERS,
            });
        }

        if (op.error) {
            const errMsg = (op.error as { message?: string })?.message ?? "Video generation failed";
            return new Response(
                JSON.stringify({ done: true, error: errMsg }),
                { status: 200, headers: CORS_HEADERS }
            );
        }

        // Response shape from fetchPredictOperation:
        // op.response.generatedSamples[0].video.uri (GCS) or .videoData (base64)
        const response = op.response as Record<string, unknown> | undefined;
        console.log("Veo done response keys:", JSON.stringify(Object.keys(response ?? {})));

        // Veo returns video at generatedSamples[0].video.uri (GCS URI)
        // Legacy shape also supported: videos[0].gcsUri
        type VideoSample = { video?: { uri?: string } };
        const generatedSamples = response?.generatedSamples as VideoSample[] | undefined;
        type VideoLegacy = { gcsUri?: string };
        const legacyVideos = response?.videos as VideoLegacy[] | undefined;

        let gcsUri: string | undefined;
        if (Array.isArray(generatedSamples) && generatedSamples.length > 0) {
            gcsUri = generatedSamples[0].video?.uri;
        } else if (Array.isArray(legacyVideos) && legacyVideos.length > 0) {
            gcsUri = legacyVideos[0].gcsUri;
        }

        if (!gcsUri) {
            console.error("No GCS URI found in response:", JSON.stringify(response));
            return new Response(
                JSON.stringify({ done: true, error: "No video GCS URI in response — ensure VEO_OUTPUT_BUCKET is configured" }),
                { status: 200, headers: CORS_HEADERS }
            );
        }

        // Bucket is public — convert gs:// URI to permanent HTTPS URL.
        const publicUrl = gcsUri.replace(/^gs:\/\//, "https://storage.googleapis.com/");
        console.log("Video ready:", publicUrl);

        // Save to studio_videos only when this is the final segment (is_final flag from frontend)
        if (is_final && SUPABASE_SERVICE_ROLE_KEY) {
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { error: insertError } = await supabaseAdmin
                .from("studio_videos")
                .insert({
                    user_id: user.id,
                    video_url: publicUrl,
                    description: description ?? null,
                    goal: goal ?? null,
                });
            if (insertError) {
                console.error("Failed to save video to studio_videos:", insertError);
            } else {
                // Increment usage counter — non-blocking, fail silently
                supabaseAdmin.rpc("increment_subscription_counter", {
                    p_user_id: user.id,
                    p_column: "reels_used",
                    p_amount: 1,
                }).then(({ error: rpcErr }) => {
                    if (rpcErr) console.error("increment_subscription_counter error:", rpcErr);
                });
            }
        }

        return new Response(
            JSON.stringify({ done: true, video_url: publicUrl, video_uri: gcsUri }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (err) {
        console.error("studio-reels-status error:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
