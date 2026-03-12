// library-bind — Bind user-edited caption/names onto a library image via VPS overlay.
// Called by signed-in users from the library page. Returns base64 image for download; no DB save.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const VPS_URL = Deno.env.get("VPS_WORKERS_URL");
const VPS_SECRET = Deno.env.get("VPS_SECRET");

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

interface LibraryBindRequest {
    image_url: string;
    names?: string | null;
    caption: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(
                JSON.stringify({ error: "Missing or invalid Authorization header" }),
                { status: 401, headers: CORS_HEADERS }
            );
        }
        const token = authHeader.replace("Bearer ", "").trim();

        // Verify JWT and get user (requires SUPABASE_ANON_KEY in edge env)
        if (!SUPABASE_ANON_KEY) {
            console.error("library-bind: SUPABASE_ANON_KEY not set");
            return new Response(
                JSON.stringify({ error: "Server configuration error" }),
                { status: 500, headers: CORS_HEADERS }
            );
        }
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: CORS_HEADERS }
            );
        }

        const body = (await req.json()) as LibraryBindRequest;
        const { image_url, names, caption } = body;
        if (!image_url || typeof image_url !== "string" || !caption || typeof caption !== "string") {
            return new Response(
                JSON.stringify({ error: "image_url and caption are required" }),
                { status: 400, headers: CORS_HEADERS }
            );
        }

        if (!VPS_URL || !VPS_SECRET) {
            return new Response(
                JSON.stringify({ error: "Binding service unavailable" }),
                { status: 503, headers: CORS_HEADERS }
            );
        }

        const vpsResp = await fetch(`${VPS_URL}/workers/overlay-buffer`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-vps-secret": VPS_SECRET },
            body: JSON.stringify({
                image_url,
                meme_metadata: {
                    names: names ?? "",
                    caption,
                    theme: "Roast",
                    watermark: "www.memesupreme.co",
                },
            }),
        });

        if (!vpsResp.ok) {
            console.error("library-bind: VPS overlay error", vpsResp.status, await vpsResp.text());
            return new Response(
                JSON.stringify({ error: "Failed to generate image" }),
                { status: 502, headers: CORS_HEADERS }
            );
        }

        const vpsData = await vpsResp.json();
        if (!vpsData.success || !vpsData.image_base64) {
            return new Response(
                JSON.stringify({ error: "Invalid response from binding service" }),
                { status: 502, headers: CORS_HEADERS }
            );
        }

        return new Response(
            JSON.stringify({ image_base64: vpsData.image_base64 }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (err) {
        console.error("library-bind error:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
