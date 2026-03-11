// supabase/functions/_shared/geminiConfig.ts
// Single source for Google/Gemini API key and model presets.
// Workers and functions use the same call path (GeminiService) and pass the model they need.
//
// ─── MODEL REGISTRY (all models we use) ─────────────────────────────────────────────
// Add new use-cases here and use getModel("useCase") so switching is one place.
//
// | Use-case        | Model (below)           | Where used                          |
// |-----------------|-------------------------|-------------------------------------|
// | chat            | gemini-3-flash-preview  | llm-handler-gemini, streamingChatHelper, together-mode, folder-ai |
// | title           | gemini-2.5-flash        | titleGenerationService              |
// | memory          | gemini-2.5-flash        | extract-user-memory                 |
// | meme            | gemini-2.5-flash        | meme-worker                         |
// | extractPatterns | gemini-2.5-flash        | extract-patterns (via llm-handler)  |
// | imagePrompt     | gemini-2.5-flash        | meme-worker, image-generate         |
// | (alternate model) | gemini-2.5-flash        | ALTERNATE_CHAT_MODEL when primary fails or conversation requires it |
// | (web search)   | SEARCH_MODEL            | google-search                       |
// | signalLab      | mistral-medium-latest   | signal-lab-generate (Swiss + instructions) |
// | (images)       | IMAGEN_MODEL (Imagen 4 Fast) | imageToolHandler, image-generate |
// | (TTS)           | google-tts              | ttsWorker, google-text-to-speech    |
// | (STT)           | google-stt-standard     | google-whisper                      |
//
// To add a new model: add a key to MODELS and use getModel("newKey") at the call site.
//
// IMPORTANT: Worker must provide BOTH model AND thinking config:
//   - Gemini 3.x: { model: "gemini-3-flash-preview", thinkingLevel: "minimal" }
//   - Gemini 2.5:  { model: "gemini-2.5-flash", thinkingBudget: 0 }
//
// Usage (example: title worker with 2.5):
//   import { GeminiService } from "./llmService.ts";
//   import { getModel } from "./geminiConfig.ts";
//   const geminiService = new GeminiService();
//   const result = await geminiService.generateContent(
//     [{ role: "user", parts: [{ text: prompt }] }],
//     undefined,
//     { model: getModel("title"), thinkingBudget: 0, temperature: 0.3, maxOutputTokens: 30 }
//   );

const ENV_GOOGLE_API_KEY = "GOOGLE-LLM-NEW";
/** Optional second key for background use (extract-patterns, memory, title, meme). Reduces 503s by spreading quota. */
const ENV_GOOGLE_BACKGROUND_KEY = "GOOGLE_LLM_BACKGROUND";
/** Key used for one retry when chat (primary key) fails. STT key is low use and can spread quota. */
const ENV_GOOGLE_CHAT_RETRY_KEY = "GOOGLE-STT-NEW";
const ENV_CHAT_MODEL = "GEMINI_MODEL"; // optional override for chat only
/** Env: comma-separated plans that use economy LLM (e.g. "free,plus" or "free,8_monthly"). Default "free,plus". */
const ENV_LLM_ECONOMY_PLANS = "LLM_ECONOMY_PLANS";

/** Alternate chat model when primary fails (and after one retry) or selected. Must support streaming. */
export const ALTERNATE_CHAT_MODEL = 'gemini-2.5-flash';

/** Web search tool (google-search). */
export const SEARCH_MODEL = "gemini-2.5-flash";

/** Image generation (imageToolHandler, image-generate). Imagen 4 Fast. */
export const IMAGEN_MODEL = "imagen-4.0-fast-generate-001";

/** Plan values that get economy tier (Gemini 2.5 from the start, no cache). */
export function getPlansUsingEconomyLlm(): string[] {
  const raw = Deno.env.get(ENV_LLM_ECONOMY_PLANS);
  if (raw && raw.trim() !== "") {
    return raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  }
  return ["free", "plus"];
}

/** True when subscription_plan should use economy LLM (2.5 only, no retry to primary). */
export function isEconomyPlan(plan: string | null | undefined): boolean {
  if (plan == null || plan === "") return false;
  const economy = getPlansUsingEconomyLlm();
  return economy.includes(plan.trim().toLowerCase());
}

/**
 * Model presets per use-case. Change here to switch models app-wide.
 * Workers call GeminiService.generateContent(..., { model: getModel("title") }).
 */
export const MODELS = {
  /** Main chat (llm-handler-gemini, together-mode, folder-ai) - uses thinkingLevel */
  chat: "gemini-3-flash-preview",
  /** Thread title generation - uses thinkingBudget: 0 */
  title: "gemini-2.5-flash",
  /** User memory extraction - uses thinkingBudget: 0 */
  memory: "gemini-2.5-flash",
  /** Meme caption / scene generation - uses thinkingBudget: 0 */
  meme: "gemini-2.5-flash",
  /** Pattern extraction - uses thinkingBudget: 0 */
  extractPatterns: "gemini-2.5-flash",
  /** Image generation prompt (meme-worker, image-generate) - uses thinkingBudget: 0 */
  imagePrompt: "gemini-2.5-flash",
  /** Signal lab questions generator (Swiss data + instructions) */
  signalLab: "mistral-medium-latest",
} as const;

export type GeminiUseCase = keyof typeof MODELS;

/**
 * API key for Google Generative Language API.
 * For chat/cache use the primary key. For background use-cases (memory, title, meme, extractPatterns)
 * returns GOOGLE_LLM_BACKGROUND if set, so you can spread quota across two keys and reduce 503s.
 */
export function getGoogleApiKey(useCase?: GeminiUseCase): string {
  const primary = Deno.env.get(ENV_GOOGLE_API_KEY) ?? "";
  if (!useCase || useCase === "chat" || useCase === "imagePrompt") return primary;
  const background = Deno.env.get(ENV_GOOGLE_BACKGROUND_KEY);
  return (background && background.trim() !== "") ? background : primary;
}

/**
 * API key used for one retry when the primary chat call fails (e.g. 503).
 * Uses STT key (GOOGLE-STT-NEW) so retries don't hammer the main LLM key.
 * Falls back to primary if not set.
 */
export function getGoogleApiKeyForChatRetry(): string {
  const retryKey = Deno.env.get(ENV_GOOGLE_CHAT_RETRY_KEY);
  if (retryKey && retryKey.trim() !== "") return retryKey;
  return getGoogleApiKey("chat");
}

/**
 * Model string for a given use-case. Use this when calling GeminiService.generateContent(..., { model: getModel("title") }).
 * Chat respects GEMINI_MODEL env override; other use-cases use MODELS[useCase].
 */
export function getModel(useCase: GeminiUseCase): string {
  if (useCase === "chat") {
    return Deno.env.get(ENV_CHAT_MODEL) ?? MODELS.chat;
  }
  return MODELS[useCase];
}
