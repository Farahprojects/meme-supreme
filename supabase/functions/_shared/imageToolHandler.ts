// supabase/functions/_shared/imageToolHandler.ts
// Handles image generation tool calls with inline rate limiting (no edge function hop)
// This flattens the architecture: LLM → imageToolHandler → Google Imagen (direct)

import type { SupabaseClient } from "./types.ts";
import { checkLimit, incrementUsage } from "./limitChecker.ts";
import { sendPlaceholder } from "./uiStatusManager.ts";
import { logCostEvent } from "./costLogger.ts";
import { IMAGE_LIMIT_EXCEEDED_MESSAGE, IMAGE_TRIAL_EXPIRED_MESSAGE } from "./imageLimits.ts";
import { IMAGEN_MODEL } from "./geminiConfig.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_API_KEY = Deno.env.get("GOOGLE-MEME")!;
const CUSTOM_DOMAIN = Deno.env.get("CUSTOM_DOMAIN") || SUPABASE_URL;

export interface ImageToolResult {
  success: boolean;
  text: string;
  imageId?: string;
  error?: string;
  errorCode?: string | undefined;
}

/**
 * Handle image generation tool call with inline rate limiting.
 * Eliminates the HTTP hop to check-rate-limit edge function (~100-300ms savings).
 */
export async function handleImageToolCall(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    userId: string;
    prompt: string;
    mode?: string;
    requestId?: string;
  }
): Promise<ImageToolResult> {
  const { chatId, userId, prompt, mode, requestId } = params;
  const startTime = Date.now();

  // 1. INLINE RATE LIMIT CHECK (no HTTP hop)
  const limitCheck = await checkLimit(supabase, userId, "image_generation", 1);

  if (!limitCheck.allowed) {
    const errorMessage =
      limitCheck.error_code === "TRIAL_EXPIRED"
        ? IMAGE_TRIAL_EXPIRED_MESSAGE
        : IMAGE_LIMIT_EXCEEDED_MESSAGE;

    console.info(
      JSON.stringify({
        event: "image_tool_rate_limited",
        user_id: userId,
        chat_id: chatId,
        error_code: limitCheck.error_code,
        latency_ms: Date.now() - startTime,
      })
    );

    return {
      success: false,
      text: errorMessage,
      ...(limitCheck.error_code !== undefined && { errorCode: limitCheck.error_code }),
    };
  }

  // 2. INCREMENT USAGE (fire-and-forget)
  void incrementUsage(supabase, userId, "image_generation", 1).catch((e) =>
    console.error("[imageToolHandler] Increment failed:", e)
  );

  // 3. CREATE PLACEHOLDER MESSAGE
  const imageId = crypto.randomUUID();
  await sendPlaceholder(supabase, {
    chatId,
    userId,
    type: "image_generation",
    meta: { image_prompt: prompt },
    id: imageId,
  });

  // 4. FIRE-AND-FORGET IMAGE GENERATION (don't await - return immediately)
  generateAndUploadImage(supabase, {
    chatId,
    userId,
    prompt,
    imageId,
    ...(mode !== undefined && { mode }),
    ...(requestId !== undefined && { requestId }),
  }).catch((e) => console.error("[imageToolHandler] Background generation failed:", e));

  console.info(
    JSON.stringify({
      event: "image_tool_dispatched",
      user_id: userId,
      chat_id: chatId,
      image_id: imageId,
      latency_ms: Date.now() - startTime,
    })
  );

  return {
    success: true,
    text: "",
    imageId,
  };
}

/**
 * Background image generation - calls Google Imagen directly and uploads to storage.
 * This is the "flattened" path that eliminates the image-generate edge function hop.
 */
async function generateAndUploadImage(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    userId: string;
    prompt: string;
    imageId: string;
    mode?: string;
    requestId?: string;
  }
): Promise<void> {
  const { chatId, userId, prompt, imageId, mode, requestId } = params;
  const generationStartTime = Date.now();

  try {
    // Dynamic import to avoid loading SDK unless needed
    const { GoogleGenAI } = await import(
      "https://esm.sh/@google/genai@1.1.0?target=deno&no-dts&deps=std@0.224.0"
    );
    const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    // Generate image
    const config = {
      numberOfImages: 1,
      aspectRatio: mode === "sync" ? "3:4" : "1:1",
      outputMimeType: "image/jpeg",
      compressionQuality: 75,
    };

    const response = await genAI.models.generateImages({
      model: IMAGEN_MODEL,
      prompt,
      config,
    });

    const base64Image = response.generatedImages?.[0]?.image?.imageBytes;
    if (!base64Image) {
      throw new Error("No image data in API response");
    }

    // Decode base64
    const binary = atob(base64Image);
    const imageBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      imageBytes[i] = binary.charCodeAt(i);
    }

    // Upload to storage
    const timestamp = Date.now();
    const fileName = `${timestamp}-${imageId}.jpg`;
    const filePath = `${userId}/${fileName}`;
    const publicUrl = `${CUSTOM_DOMAIN}/storage/v1/object/public/generated-images/${filePath}`;
    const generationTime = Date.now() - generationStartTime;

    // Parallel: upload + update message
    const [uploadResult, updateResult] = await Promise.all([
      supabase.storage.from("generated-images").upload(filePath, imageBytes, {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=31536000, immutable",
      }),
      supabase
        .from("messages")
        .update({
          text: "",
          status: "complete",
          meta: {
            message_type: "image",
            image_url: publicUrl,
            image_path: filePath,
            image_prompt: prompt,
            image_model: IMAGEN_MODEL,
            image_size: mode === "sync" ? "1080x1440" : "1024x1024",
            image_format: "jpg",
            generation_time_ms: generationTime,
            cost_usd: 0.02,
          },
        })
        .eq("id", imageId)
        .select()
        .single(),
    ]);

    if (uploadResult.error) {
      console.error("[imageToolHandler] Upload failed:", uploadResult.error);
      await supabase
        .from("messages")
        .update({ status: "failed", meta: { error: uploadResult.error.message } })
        .eq("id", imageId);
      return;
    }

    // Log cost
    logCostEvent(supabase, {
      source: "image_generation",
      modality: "image",
      model: IMAGEN_MODEL,
      input_units: 1,
      output_units: 0,
      user_id: userId,
      chat_id: chatId,
      ...(requestId !== undefined && { request_id: requestId }),
    }).catch((e) => console.error("[imageToolHandler] Cost log failed:", e));

    // Fire-and-forget: user_images table + broadcast
    const updatedMessage = updateResult.data;

    void Promise.resolve(
      supabase
        .from("user_images")
        .insert({
          user_id: userId,
          chat_id: chatId,
          message_id: imageId,
          image_url: publicUrl,
          image_path: filePath,
          prompt,
          model: IMAGEN_MODEL,
          size: mode === "sync" ? "1080x1440" : "1024x1024",
        })
    )
      .then(() => {
        // Broadcast to gallery
        supabase
          .channel(`user-realtime:${userId}`)
          .send(
            { type: "broadcast", event: "image-insert", payload: { image_url: publicUrl } },
            { httpSend: true }
          )
          .catch(() => { });
      })
      .catch((e: Error) => console.error("[imageToolHandler] User image insert failed:", e));

    // Broadcast message update
    if (updatedMessage) {
      supabase
        .channel(`user-realtime:${userId}`)
        .send(
          {
            type: "broadcast",
            event: "message-update",
            payload: { chat_id: chatId, message: updatedMessage },
          },
          { httpSend: true }
        )
        .catch(() => { });
    }

    console.info(
      JSON.stringify({
        event: "image_generation_complete",
        image_id: imageId,
        generation_time_ms: generationTime,
        total_time_ms: Date.now() - generationStartTime,
      })
    );
  } catch (error) {
    console.error("[imageToolHandler] Generation failed:", error);

    // Mark message as failed
    await supabase
      .from("messages")
      .update({
        status: "failed",
        meta: { error: error instanceof Error ? error.message : String(error) },
      })
      .eq("id", imageId);
  }
}
