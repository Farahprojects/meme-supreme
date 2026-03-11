// Message Persistence Service
// Inlined logic from message-persistence edge function to eliminate HTTP hop
// Handles: DB insert, broadcast, memory extraction trigger, usage increment

import type { SupabaseClient } from "./types.ts";
import { incrementUsage } from "./limitChecker.ts";
import { getBroadcastTargets } from "./streamBroadcast.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface MessagePayload {
  chat_id: string;
  role: "user" | "assistant" | "system" | "starter" | "starter_context";
  text: string;
  client_msg_id: string;
  status: "complete";
  mode: string;
  user_id?: string | null;
  user_name?: string | null;
  meta?: Record<string, unknown>;
}

export interface PersistenceOptions {
  shouldBroadcast?: boolean;
  fallbackUserId?: string | null;
  /** When true, skip getParticipants DB query and broadcast only to fallbackUserId (1:1 chat). Use for single-participant flows. */
  singleParticipantOnly?: boolean;
}

// ============================================================================
// ENVIRONMENT
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// HELPERS (getBroadcastTargets from streamBroadcast.ts)
// ============================================================================

async function broadcastMessage(
  supabase: SupabaseClient,
  chatId: string,
  message: Record<string, unknown>,
  fallbackUserId: string | null | undefined,
  _requestId: string,
  singleParticipantOnly?: boolean
): Promise<void> {
  const targets = await getBroadcastTargets(supabase, chatId, fallbackUserId, singleParticipantOnly);
  await Promise.allSettled(
    targets.map(async (targetId) => {
      const channel = supabase.channel(`user-realtime:${targetId}`);
      try {
        await channel.send({ type: "broadcast", event: "message-insert", payload: { chat_id: chatId, message } }, { httpSend: true });
      } finally {
        await supabase.removeChannel(channel);
      }
    })
  );
}

// broadcastStreamEvent is exported from streamBroadcast.ts for llm-handler-gemini.
export { broadcastStreamEvent } from "./streamBroadcast.ts";

function triggerMemoryExtraction(message: { role: string; text?: string; chat_id?: string; id?: string; user_id?: string }, requestId: string): void {
  // Only for assistant messages with meaningful content
  if (message.role !== "assistant" || !message.text || message.text.length < 50) {
    return;
  }

  fetch(`${SUPABASE_URL}/functions/v1/extract-user-memory`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({
      conversation_id: message.chat_id,
      message_id: message.id,
      user_id: message.user_id
    })
  }).catch(err => {
    console.error(`[MessagePersistence][${requestId}] Memory extraction failed:`, err.message);
  });
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

/**
 * Persist messages directly to the database and trigger async side effects.
 * Eliminates the HTTP hop to message-persistence edge function (~50-150ms savings).
 */
export async function persistMessages(
  supabase: SupabaseClient,
  messages: MessagePayload[],
  options: PersistenceOptions & { requestId: string }
): Promise<{ success: boolean; insertedMessages?: Record<string, unknown>[]; error?: string }> {
  const { requestId, shouldBroadcast = true, fallbackUserId, singleParticipantOnly } = options;
  const _startTime = Date.now();

  try {
    if (!messages?.length) {
      return { success: false, error: "No messages to persist" };
    }

    // Insert messages
    const { data: insertedMessages, error } = await supabase
      .from("messages")
      .insert(messages)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(`[MessagePersistence][${requestId}] Insert failed:`, error.message);
      return { success: false, error: error.message };
    }

    // Fire async tasks (don't await)
    if (shouldBroadcast && insertedMessages.length > 0) {
      const chatId = insertedMessages[0].chat_id;
      Promise.all(
        insertedMessages.map((msg: Record<string, unknown>) =>
          broadcastMessage(supabase, chatId, msg, fallbackUserId, requestId, singleParticipantOnly)
        )
      ).catch(() => { /* logged in broadcastMessage */ });
    }

    // Trigger memory extraction for assistant messages
    insertedMessages
      .filter((m: Record<string, unknown>) => m.role === "assistant")
      .forEach((m: Record<string, unknown>) => triggerMemoryExtraction(m as { role: string; text?: string; chat_id?: string; id?: string; user_id?: string }, requestId));

    // Increment usage for user messages
    const userMessages = insertedMessages.filter((m: Record<string, unknown>) => m.role === "user");
    if (userMessages.length > 0 && userMessages[0].user_id) {
      incrementUsage(supabase, userMessages[0].user_id as string, "chat", userMessages.length)
        .catch((err: unknown) => {
          console.error(`[MessagePersistence][${requestId}] Usage increment failed:`, err);
        });
    }

    return { success: true, insertedMessages };

  } catch (err) {
    console.error(`[MessagePersistence][${requestId}] Unexpected error:`, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Broadcast a "thinking" status to all conversation participants.
 * When singleParticipantOnly is true, skips getParticipants and broadcasts only to userId (1:1 chat).
 */
export async function broadcastThinking(
  supabase: SupabaseClient,
  chatId: string,
  userId: string,
  singleParticipantOnly?: boolean
): Promise<void> {
  const targetIds = await getBroadcastTargets(supabase, chatId, userId, singleParticipantOnly);

  await Promise.allSettled(
    targetIds.map(async (targetId) => {
      const channel = supabase.channel(`user-realtime:${targetId}`);
      try {
        await channel.send({ type: "broadcast", event: "assistant-thinking", payload: { chat_id: chatId, status: "thinking" } }, { httpSend: true });
      } finally {
        await supabase.removeChannel(channel);
      }
    })
  );
}
