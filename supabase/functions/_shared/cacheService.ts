// supabase/functions/_shared/cacheService.ts
// Google Context Cache management for Gemini conversations
// Extracts caching logic from llm-handler-gemini for better maintainability

import type { SupabaseClient } from "./types.ts";
import { hashString } from "./textUtils.ts";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE-MEME")!;
const DEFAULT_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3-flash-preview";
const CACHE_TTL_SECONDS = 3600; // 1 hour

export interface CacheCheckResult {
  cacheName: string | null;
  isValid: boolean;
  needsCreation: boolean;
}

export interface CacheData {
  cache_name: string;
  expires_at: string;
  system_data_hash: string;
}

/**
 * Check if existing cache is still valid for the given system text and memory context.
 */
export function validateCache(
  cacheData: CacheData | null,
  systemText: string,
  memoryContext?: string
): CacheCheckResult {
  if (!cacheData || !systemText) {
    return { cacheName: null, isValid: false, needsCreation: !!systemText };
  }

  // Hash must match the formula used in createContextCache
  const currentHash = hashString(systemText + (memoryContext || ""));
  const isExpired = new Date(cacheData.expires_at) <= new Date();
  const hashMismatch = cacheData.system_data_hash !== currentHash;

  if (isExpired || hashMismatch) {
    return { cacheName: null, isValid: false, needsCreation: true };
  }

  return { cacheName: cacheData.cache_name, isValid: true, needsCreation: false };
}

/**
 * Create a new Google Context Cache for a conversation.
 * This is typically called asynchronously (fire-and-forget) to avoid blocking the response.
 */
export async function createContextCache(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    systemPrompt: string;
    systemText: string;
    tools?: unknown[] | undefined;
    toolConfig?: unknown;
    memoryContext?: string | undefined;
    model?: string | undefined;
    requestId?: string | undefined;
  }
): Promise<string | null> {
  const { chatId, systemPrompt, systemText, tools, toolConfig, memoryContext, model, requestId } = params;
  // Hash includes memory so cache invalidates when memory changes
  const systemDataHash = hashString(systemText + (memoryContext || ""));
  const modelName = model ? (model.startsWith("models/") ? model : `models/${model}`) : `models/${DEFAULT_MODEL}`;

  // Combine system prompt with context data (and memory if available)
  const instructionParts = [
    systemPrompt,
    `[System Data]\n${systemText}`,
    memoryContext ? `<user_memory>\n${memoryContext}\n</user_memory>` : "",
    `[CRITICAL: Remember Your Instructions]\n${systemPrompt}`,
  ].filter(Boolean);
  const combinedSystemInstruction = instructionParts.join("\n\n");

  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/cachedContents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        model: modelName,
        systemInstruction: { role: "system", parts: [{ text: combinedSystemInstruction }] },
        tools: tools || undefined,
        toolConfig: toolConfig || undefined,
        ttl: `${CACHE_TTL_SECONDS}s`,
      }),
    });

    if (!resp.ok) {
      const errorBody = await resp.text();
      console.error(`[cacheService][${chatId}] ❌ Google API Cache Error (${resp.status}):`, errorBody);
      return null;
    }

    const body = await resp.json();
    const cacheName = body?.name;

    if (!cacheName) {
      console.error(`[cacheService][${chatId}] ❌ No cache name in response`);
      return null;
    }

    // Store cache reference in database (expires 1 minute before actual TTL for safety margin)
    const expiresAt = new Date(Date.now() + (CACHE_TTL_SECONDS - 60) * 1000).toISOString();
    const { error: upsertError } = await supabase.from("conversation_caches").upsert({
      chat_id: chatId,
      model_name: model || DEFAULT_MODEL,
      cache_name: cacheName,
      system_data_hash: systemDataHash,
      expires_at: expiresAt,
    });

    if (upsertError) {
      console.error(`[cacheService][${chatId}] ❌ DB Upsert Error:`, upsertError);
      // Cache was created but not stored - still usable for this request
    }

    console.info(
      JSON.stringify({
        event: "cache_created",
        chat_id: chatId,
        cache_name: cacheName,
        request_id: requestId,
      })
    );

    return cacheName;
  } catch (err) {
    console.error(`[cacheService][${chatId}] ❌ Unexpected Cache Exception:`, err);
    return null;
  }
}

/**
 * Delete an existing cache (cleanup).
 */
export async function deleteContextCache(cacheName: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${cacheName}`,
      {
        method: "DELETE",
        headers: { "x-goog-api-key": GOOGLE_API_KEY },
      }
    );

    if (!resp.ok) {
      console.warn(`[cacheService] Failed to delete cache ${cacheName}: ${resp.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`[cacheService] Exception deleting cache:`, err);
    return false;
  }
}
