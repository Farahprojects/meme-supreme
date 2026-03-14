// studio-reels-script — LLM (Gemini Vision) reads reference images + description + goal, returns N-scene Veo script for user approval.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.1.0?target=deno&no-dts&deps=std@0.224.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const GOOGLE_API_KEY = Deno.env.get("GOOGLE-MEME");
const SCRIPT_MODEL = "gemini-2.5-flash-preview-04-17";
const DEFAULT_NUM_SCENES = 2;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

const GOAL_TONES: Record<string, string> = {
    engagement: "Hook viewers fast and make it shareable. End with a question or clear call to action. Optimise for comments and shares.",
    promotion: "Lead with the product or offer benefit. Show don't tell. End on clear value or CTA.",
    brand_humour: "Lean on the brand's personality. Absurdist but on-brief. End with a smile or punchline that fits the brand.",
};

interface ReelsScriptRequest {
    description: string;
    goal: "engagement" | "promotion" | "brand_humour";
    reference_images_base64?: string[];
    /** Number of scene prompts to generate (default 2). Scene 1 = fresh generation; scenes 2+ = extension prompts. */
    num_scenes?: number;
}

interface ScriptResponse {
    scenes: string[];
    rationale: string;
}

function buildSystemPrompt(description: string, goal: string, numScenes: number): string {
    const tone = GOAL_TONES[goal] ?? GOAL_TONES.engagement;
    const sceneList = Array.from({ length: numScenes }, (_, i) => {
        if (i === 0) return "Scene 1 (0–8s): Opening. Standalone prompt for a fresh 8-second video. Set the scene and hook. Describe camera, action, mood. No dialogue unless needed.";
        return `Scene ${i + 1}: EXTENSION prompt. This text is fed verbatim to a video extension API that continues from the last frame of the previous clip. You MUST start with an explicit continuation phrase such as "Directly continuing the previous scene — " or "In the next moment, the same [subject] " or "The camera then " so the model extends the video instead of re-generating. Describe what happens next in the same visual world (camera, action, mood).`;
    }).join("\n   - ");

    return `You are a short-form video script writer for vertical reels (9:16). The user will provide a description and optionally reference images.

GOAL FOR THIS REEL: ${goal.replace(/_/g, " ").toUpperCase()}
${tone}

TASK:
1. Use the description (and any reference images) to understand the subject, product, or scenario.
2. Write ${numScenes} prompts suitable for an AI video model (Veo):
   - ${sceneList}

CRITICAL for Scene 2 and beyond: Each extension prompt must begin from where the previous clip visually ends. Use temporal/continuation language so the model extends the video rather than creating a duplicate of the first scene.

Return ONLY valid JSON with no markdown or extra text, in this exact shape:
{"scenes":["...", "..."], "rationale":"Brief note on why you chose this angle for the goal."}

User description:
${description}`;
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

        if (!GOOGLE_API_KEY) {
            return new Response(JSON.stringify({ error: "Script generation unavailable" }), {
                status: 503,
                headers: CORS_HEADERS,
            });
        }

        const body = (await req.json()) as ReelsScriptRequest;
        const { description, goal, reference_images_base64, num_scenes } = body;

        if (!description?.trim()) {
            return new Response(JSON.stringify({ error: "description is required" }), {
                status: 400,
                headers: CORS_HEADERS,
            });
        }
        const validGoals = ["engagement", "promotion", "brand_humour"];
        const goalVal = (goal && validGoals.includes(goal)) ? goal : "engagement";
        const numScenes = Math.min(Math.max(Number(num_scenes) || DEFAULT_NUM_SCENES, 2), 4);
        const refImages = reference_images_base64?.slice(0, 3) ?? [];

        const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
        const systemPrompt = buildSystemPrompt(description.trim(), goalVal, numScenes);

        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
        for (const base64 of refImages) {
            parts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } });
        }
        parts.push({ text: systemPrompt });

        const response = await genAI.models.generateContent({
            model: SCRIPT_MODEL,
            contents: [{ role: "user", parts }],
            config: { responseMimeType: "application/json" },
        });

        const rawText = response.text ?? response.candidates?.[0]?.content?.parts
            ?.filter((p: { text?: string }) => typeof p?.text === "string")
            .map((p: { text: string }) => p.text)
            .join("");
        const text = rawText?.trim();
        if (!text) {
            return new Response(
                JSON.stringify({ error: "No script returned from model" }),
                { status: 502, headers: CORS_HEADERS }
            );
        }

        let parsed: ScriptResponse;
        try {
            const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "").trim();
            parsed = JSON.parse(cleaned) as ScriptResponse;
        } catch {
            return new Response(
                JSON.stringify({ error: "Invalid JSON from model", raw: text.slice(0, 200) }),
                { status: 502, headers: CORS_HEADERS }
            );
        }

        const scenes = Array.isArray(parsed.scenes) ? parsed.scenes.map((s) => String(s).trim()).filter(Boolean) : [];
        if (scenes.length < numScenes) {
            return new Response(
                JSON.stringify({ error: `Script must include ${numScenes} scene prompts; got ${scenes.length}` }),
                { status: 502, headers: CORS_HEADERS }
            );
        }

        return new Response(
            JSON.stringify({
                scenes: scenes.slice(0, numScenes),
                rationale: parsed.rationale ? String(parsed.rationale).trim() : "",
            }),
            { status: 200, headers: CORS_HEADERS }
        );
    } catch (err) {
        console.error("studio-reels-script error:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
});
