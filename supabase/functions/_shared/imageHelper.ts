// @ts-nocheck - Deno runtime, types checked at deployment
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.1.0?target=deno&no-dts&deps=std@0.224.0";
import { IMAGEN_MODEL } from "./geminiConfig.ts";
import { getVertexCreds, getVertexAccessToken } from "./vertexAuth.ts";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE-MEME");
const VERTEX_SECRET = Deno.env.get("VERTEX");

if (!GOOGLE_API_KEY && !VERTEX_SECRET) throw new Error("Missing env: GOOGLE-MEME or VERTEX");

// Developer API client — always used for standard (non-reference) generation
const genAI = GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: GOOGLE_API_KEY }) : null;

const vertexCreds = getVertexCreds();
if (vertexCreds) console.log("imageHelper: Vertex SA credentials loaded, project:", vertexCreds.project_id);

// Call Vertex AI imagen-3.0-capability-001 directly via REST (bypasses SDK env detection)
async function generateViaVertexREST(
    creds: VertexCreds,
    prompt: string,
    aspectRatio: string,
    referenceImageBase64?: string,
): Promise<string> {
    const accessToken = await getVertexAccessToken(creds);
    const location = "us-central1";
    const model = "imagen-3.0-capability-001";
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${creds.project_id}/locations/${location}/publishers/google/models/${model}:predict`;

    const instance: Record<string, unknown> = { prompt };
    if (referenceImageBase64) {
        instance.referenceImages = [
            {
                referenceType: "REFERENCE_TYPE_SUBJECT",
                referenceId: 1,
                referenceImage: { bytesBase64Encoded: referenceImageBase64 },
                subjectImageConfig: { subjectType: "SUBJECT_TYPE_DEFAULT" },
            },
        ];
    }

    // imagen-3.0-capability-001 does NOT support personGeneration
    const body = {
        instances: [instance],
        parameters: {
            sampleCount: 1,
            aspectRatio,
        },
    };

    const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const result = await resp.json();
    if (!resp.ok) {
        console.error("Vertex AI raw error response:", JSON.stringify(result));
        const msg = result?.error?.message ?? JSON.stringify(result);
        if (msg.includes("safety") || msg.includes("policy")) throw new Error("CONTENT_POLICY_VIOLATION");
        throw new Error(`Vertex AI error (${resp.status}): ${msg}`);
    }

    const base64 = result.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) throw new Error("CONTENT_POLICY_VIOLATION");
    return base64;
}

// ─── Base64 decode helper ────────────────────────────────────────────────────

function decodeBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateAndUploadRawImage(
    supabase: unknown,
    prompt: string,
    userId: string,
    mode: "sync" | "meme" | "async" = "meme",
    storageBucket = "generated-images",
    referenceImageBase64?: string,
    referenceDescription?: string,
): Promise<{ publicUrl: string; filePath: string; webpSmallUrl: string; imageId: string; generationTimeMs: number }> {

    const generationStartTime = Date.now();
    const aspectRatio = mode === "sync" || mode === "meme" ? "3:4" : "1:1";

    let cleanPrompt = `${prompt}. Full-bleed edge-to-edge image with no borders, no white borders, no frames, no cards, no margins.`;

    let base64Image: string;

    if (referenceImageBase64 && vertexCreds) {
        // Vertex AI path — REST call with service account JWT auth
        if (referenceDescription) {
            cleanPrompt = `${cleanPrompt}. The subject matches the reference image (${referenceDescription}).`;
        }
        console.log("imageHelper: generating via Vertex AI with subject reference");
        base64Image = await generateViaVertexREST(vertexCreds, cleanPrompt, aspectRatio, referenceImageBase64);
    } else {
        // Developer API path — standard Imagen 4 Fast generation
        if (referenceImageBase64 && !vertexCreds) {
            // No Vertex — inject description as text fallback
            if (referenceDescription) {
                cleanPrompt = `${cleanPrompt}. Key subject details from reference: ${referenceDescription}.`;
            }
            console.warn("imageHelper: reference image provided but VERTEX not configured — text-only fallback");
        }

        if (!genAI) throw new Error("No Google API key available for image generation");

        try {
            const response = await genAI.models.generateImages({
                model: IMAGEN_MODEL,
                prompt: cleanPrompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio,
                    personGeneration: "allow_adult",
                },
            });

            if (response.generatedImages?.[0]?.image?.imageBytes) {
                base64Image = response.generatedImages[0].image.imageBytes;
            } else {
                throw new Error("CONTENT_POLICY_VIOLATION");
            }
        } catch (error) {
            if (error instanceof Error && error.message === "CONTENT_POLICY_VIOLATION") throw error;
            throw new Error(`Imagen API error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const generationTimeMs = Date.now() - generationStartTime;
    const imageBytes = decodeBase64(base64Image);
    const format = "jpg";
    const timestamp = Date.now();
    const imageId = crypto.randomUUID();
    const fileName = `${timestamp}-${imageId}.${format}`;
    const filePath = `${userId}/${fileName}`;

    const CUSTOM_DOMAIN = Deno.env.get("CUSTOM_DOMAIN") || Deno.env.get("SUPABASE_URL");
    const publicUrl = `${CUSTOM_DOMAIN}/storage/v1/object/public/${storageBucket}/${filePath}`;
    const webpSmallUrl = `${CUSTOM_DOMAIN}/storage/v1/render/image/public/${storageBucket}/${filePath}?width=400&format=webp&quality=80`;

    const { error: uploadError } = await (supabase as any).storage
        .from(storageBucket)
        .upload(filePath, imageBytes, {
            contentType: `image/${format}`,
            cacheControl: "public, max-age=31536000, immutable",
        });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    return { publicUrl, filePath, webpSmallUrl, imageId, generationTimeMs };
}
