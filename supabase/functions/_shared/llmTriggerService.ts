// LLM Trigger Service
// Handles fire-and-forget LLM handler invocation
// Encapsulates routing logic for Together Mode vs Standard Gemini

// ============================================================================
// TYPES
// ============================================================================

export interface CacheDataFromChatSend {
  cache_name: string;
  expires_at: string;
  system_data_hash: string;
}

export interface LLMTriggerContext {
  chatId: string;
  userId: string;
  userName: string | null;
  mode: string;
  text: string;
  role?: string | undefined;
  analyze?: boolean | undefined;
  think?: boolean | undefined;
  chattype?: string | undefined;
  voice?: string | undefined;
  systemOverlay?: string | null | undefined;
  /** When set, llm-handler uses this instead of reading conversation_caches (single read, no duplicate). */
  cacheData?: CacheDataFromChatSend | null | undefined;
  /** Client-generated UUID for voice turn; flows through to VPS. */
  turnId?: string | undefined;
  /** Voice session ID from voice-session-start. */
  voice_session_id?: string | undefined;
}

// ============================================================================
// ENVIRONMENT
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// HELPERS
// ============================================================================

function getInternalCallHeaders(userId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "x-internal-call": "true",
    "x-user-id": userId,
  };
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

/**
 * Triggers the appropriate LLM handler based on mode.
 * Fire-and-forget pattern - does not wait for response.
 * 
 * @param ctx - The context for the LLM request
 * @returns void (fire-and-forget)
 */
export function triggerLLM(ctx: LLMTriggerContext): void {
  // CRITICAL: Together Mode must EXCLUSIVELY use together-mode handler.
  // Standard mode uses gemini handler.
  const handler = ctx.mode === "together" 
    ? "llm-handler-together-mode" 
    : "llm-handler-gemini";

  const body: Record<string, unknown> = {
    chat_id: ctx.chatId,
    text: ctx.systemOverlay || ctx.text,
    mode: ctx.mode,
    user_id: ctx.userId,
    user_name: ctx.userName,
    role: ctx.role,
    analyze: ctx.analyze,
    think: ctx.think,
    chattype: ctx.chattype,
    voice: ctx.voice,
    system_overlay: ctx.systemOverlay,
    source: "chat-send",
    turnId: ctx.turnId,
    voice_session_id: ctx.voice_session_id,
  };
  if (ctx.cacheData !== undefined) {
    body.cache_data = ctx.cacheData;
  }

  fetch(`${SUPABASE_URL}/functions/v1/${handler}`, {
    method: "POST",
    headers: getInternalCallHeaders(ctx.userId),
    body: JSON.stringify(body),
  }).catch(err => {
    console.error(`[LLMTrigger] Error invoking ${handler}:`, err.message);
  });
}

/**
 * Determines if the LLM should be triggered based on context.
 */
export function shouldTriggerLLM(
  role: string,
  intent: string,
  chattype?: string,
  mode?: string
): boolean {
  const isUserInitiated = role === "user" || role === "starter";
  const validIntent = intent === "CHAT" || intent === "STARTER" || intent === "INSIGHT";
  const voiceCheck = chattype !== "voice" || mode === "voice";
  
  return isUserInitiated && validIntent && voiceCheck;
}
