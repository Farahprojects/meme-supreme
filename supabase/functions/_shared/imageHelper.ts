// @ts-nocheck - Deno runtime, types checked at deployment
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.1.0?target=deno&no-dts&deps=std@0.224.0";
import { IMAGEN_MODEL } from "./geminiConfig.ts";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE-MEME");
if (!GOOGLE_API_KEY) throw new Error("Missing env: GOOGLE-MEME");

const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

// Base64 decode helper
function decodeBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function generateAndUploadRawImage(
    supabase: any,
    prompt: string,
    userId: string,
    mode: 'sync' | 'meme' | 'async' = 'meme',
    storageBucket: string = 'generated-images'
): Promise<{ publicUrl: string; filePath: string; webpSmallUrl: string; imageId: string; generationTimeMs: number }> {

    const generationStartTime = Date.now();
    let base64Image: string | undefined;

    // Valid Imagen API config fields only — compressionQuality is not a valid field
    // and caused Imagen to ignore the aspectRatio, producing landscape output
    const config = {
        numberOfImages: 1,
        aspectRatio: mode === 'sync' || mode === 'meme' ? '3:4' : '1:1',
        personGeneration: "allow_adult",
    };

    // Add explicit no-border instruction to every prompt
    const cleanPrompt = `${prompt}. Full-bleed edge-to-edge image with no borders, no white borders, no frames, no cards, no margins.`;

    try {
        const response = await genAI.models.generateImages({
            model: IMAGEN_MODEL,
            prompt: cleanPrompt,
            config: config
        });

        if (response.generatedImages?.[0]?.image?.imageBytes) {
            base64Image = response.generatedImages[0].image.imageBytes;
        } else {
            const err = new Error("CONTENT_POLICY_VIOLATION");
            (err as any).promptUsed = cleanPrompt;
            throw err;
        }
    } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_POLICY_VIOLATION") {
            throw error;
        }
        throw new Error(`Imagen API error: ${error instanceof Error ? error.message : String(error)}`);
    }

    const generationTimeMs = Date.now() - generationStartTime;
    const imageBytes = decodeBase64(base64Image);
    const format = 'jpg';
    const timestamp = Date.now();
    const imageId = crypto.randomUUID();
    const fileName = `${timestamp}-${imageId}.${format}`;
    const filePath = `${userId}/${fileName}`;

    const CUSTOM_DOMAIN = Deno.env.get("CUSTOM_DOMAIN") || Deno.env.get("SUPABASE_URL");
    const publicUrl = `${CUSTOM_DOMAIN}/storage/v1/object/public/${storageBucket}/${filePath}`;
    const webpSmallUrl = `${CUSTOM_DOMAIN}/storage/v1/render/image/public/${storageBucket}/${filePath}?width=400&format=webp&quality=80`;

    // Upload raw image
    const { error: uploadError } = await supabase.storage
        .from(storageBucket)
        .upload(filePath, imageBytes, {
            contentType: `image/${format}`,
            cacheControl: 'public, max-age=31536000, immutable',
        });

    if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
    }

    return { publicUrl, filePath, webpSmallUrl, imageId, generationTimeMs };
}
