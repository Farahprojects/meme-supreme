// Stream broadcast - minimal module for llm-handler-gemini and messagePersistenceService.
// Exports only participant resolution + stream-event broadcast (no limitChecker, no persist logic).

import type { SupabaseClient } from "./types.ts";

export async function getParticipants(supabase: SupabaseClient, chatId: string): Promise<string[]> {
  const { data } = await supabase
    .from("conversations_participants")
    .select("user_id")
    .eq("conversation_id", chatId);

  return data?.map((p: { user_id: string }) => p.user_id) ?? [];
}

export async function getBroadcastTargets(
  supabase: SupabaseClient,
  chatId: string,
  fallbackUserId: string | null | undefined,
  singleParticipantOnly?: boolean
): Promise<string[]> {
  if (singleParticipantOnly && fallbackUserId) {
    return [fallbackUserId];
  }
  const participants = await getParticipants(supabase, chatId);
  return participants.length > 0 ? participants : (fallbackUserId ? [fallbackUserId] : []);
}

/**
 * Broadcast a stream or other event to all conversation participants (same channel as message-insert).
 * Used for stream-start, stream-chunk, stream-done, stream-error from llm-handler.
 */
export async function broadcastStreamEvent(
  supabase: SupabaseClient,
  chatId: string,
  event: "stream-start" | "stream-chunk" | "stream-done" | "stream-error",
  payload: Record<string, unknown>,
  fallbackUserId: string | null | undefined,
  singleParticipantOnly?: boolean
): Promise<void> {
  const targets = await getBroadcastTargets(supabase, chatId, fallbackUserId, singleParticipantOnly);
  await Promise.allSettled(
    targets.map(async (targetId) => {
      const channel = supabase.channel(`user-realtime:${targetId}`);
      try {
        await channel.send({ type: "broadcast", event, payload: { chat_id: chatId, ...payload } }, { httpSend: true });
      } finally {
        await supabase.removeChannel(channel);
      }
    })
  );
}

/**
 * Broadcast message-insert (new message row).
 * Used by chat-send streaming path for assistant placeholder.
 */
export async function broadcastMessageInsert(
  supabase: SupabaseClient,
  chatId: string,
  message: Record<string, unknown>,
  fallbackUserId: string | null | undefined,
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

/**
 * Broadcast message-update (e.g. placeholder final content, status=complete|failed).
 * Used by chat-send streaming path when assistant row is updated.
 */
export async function broadcastMessageUpdate(
  supabase: SupabaseClient,
  chatId: string,
  message: Record<string, unknown>,
  fallbackUserId: string | null | undefined,
  singleParticipantOnly?: boolean
): Promise<void> {
  const targets = await getBroadcastTargets(supabase, chatId, fallbackUserId, singleParticipantOnly);
  await Promise.allSettled(
    targets.map(async (targetId) => {
      const channel = supabase.channel(`user-realtime:${targetId}`);
      try {
        await channel.send({ type: "broadcast", event: "message-update", payload: { chat_id: chatId, message } }, { httpSend: true });
      } finally {
        await supabase.removeChannel(channel);
      }
    })
  );
}
