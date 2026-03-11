// supabase/functions/_shared/titleGenerationService.ts
// v1.0.2 - 2026-02-02: Use gemini-2.5-flash + thinkingBudget: 0
// Use 'any' for supabase client to avoid version mismatch issues between shared modules.

import { GeminiService } from "./llmService.ts";
import { getModel, getGoogleApiKey } from "./geminiConfig.ts";

const geminiService = new GeminiService(getGoogleApiKey("title"));

/**
 * Broadcasts conversation update to all participants via WebSocket
 */
async function broadcastConversationUpdate(
    supabase: any,
    chatId: string,
    userId: string,
    updatedData: Record<string, unknown>
): Promise<void> {
    // Get participants for this conversation
    const { data: participants } = await supabase
        .from("conversations_participants")
        .select("user_id")
        .eq("conversation_id", chatId);

    // Include owner + any participants
    const targetIds = new Set<string>([userId]);
    participants?.forEach((p: { user_id: string }) => targetIds.add(p.user_id));

    // Broadcast to each user's unified channel
    await Promise.allSettled(
        Array.from(targetIds).map(async (targetId) => {
            const channel = supabase.channel(`user-realtime:${targetId}`);
            try {
                await channel.send(
                    { type: "broadcast", event: "conversation-update", payload: { eventType: "UPDATE", data: { id: chatId, ...updatedData } } },
                    { httpSend: true }
                );
            } finally {
                await supabase.removeChannel(channel);
            }
        })
    );

}

/**
 * Broadcasts new conversation INSERT to the owner so the thread list updates without refresh.
 * Used when a conversation is created (e.g. voice overlay, chat-send with no chat_id).
 */
export async function broadcastConversationInsert(
    supabase: any,
    userId: string,
    data: {
        id: string;
        user_id: string;
        title?: string | null;
        mode: string;
        created_at?: string | null;
        updated_at?: string | null;
        person_a_log_id?: string | null;
        person_a_name?: string | null;
        person_b_log_id?: string | null;
        person_b_name?: string | null;
        folder_id?: string | null;
    }
): Promise<void> {
    const channel = supabase.channel(`user-realtime:${userId}`);
    try {
        await channel.send(
            {
                type: "broadcast",
                event: "conversation-update",
                payload: {
                    eventType: "INSERT",
                    data: {
                        id: data.id,
                        user_id: data.user_id,
                        title: data.title ?? "New Chat",
                        mode: data.mode,
                        created_at: data.created_at ?? new Date().toISOString(),
                    updated_at: data.updated_at ?? new Date().toISOString(),
                    person_a_log_id: data.person_a_log_id ?? null,
                    person_a_name: data.person_a_name ?? null,
                    person_b_log_id: data.person_b_log_id ?? null,
                    person_b_name: data.person_b_name ?? null,
                    folder_id: data.folder_id ?? null,
                },
            },
        },
            { httpSend: true }
        );
    } finally {
        await supabase.removeChannel(channel);
    }
}

/**
 * Generates a title for a conversation based on the first message and persists it to DB.
 * Designed to be 'fire-and-forget' from chat-send.
 */
export async function generateAndPersistTitle(
    supabase: any,
    chatId: string,
    messageText: string,
    userId?: string
): Promise<void> {

    // Safety check for empty or very short messages
    if (!messageText || messageText.trim().length < 5) {
        return;
    }

    // 🛡️ GUARD: Skip if conversation already has a meaningful title OR is 'together' mode
    const { data: existing } = await supabase
        .from('conversations')
        .select('title, mode')
        .eq('id', chatId)
        .single();

    // Skip 'together' mode entirely - keep their fixed title
    if (existing?.mode === 'together') {
        return;
    }

    const existingTitle = existing?.title?.trim();
    if (existingTitle && existingTitle !== 'New Chat' && existingTitle.length > 0) {
        return;
    }

    const prompt = `Generate a concise 3-4 word title for a conversation that starts with this message. Return ONLY the title, nothing else.

Message: "${messageText.slice(0, 500)}"

Title:`;

    try {
        const result = await geminiService.generateContent(
            [{ role: "user", parts: [{ text: prompt }] }],
            undefined,
            { model: getModel("title"), thinkingBudget: 0, temperature: 0.3, maxOutputTokens: 30 }
        );
        const { text, usage } = result;

        const cleanTitle = text
            .replace(/^["']|["']$/g, "")
            .replace(/\*\*/g, "")
            .slice(0, 50)
            .trim();

        if (!cleanTitle) {
            console.warn(`[TitleWorker] Generated empty title, skipping update.`);
            return;
        }


        const updatedAt = new Date().toISOString();

        // Update the conversation title authoritatively
        const { error } = await supabase
            .from('conversations')
            .update({
                title: cleanTitle,
                updated_at: updatedAt
            })
            .eq('id', chatId);

        if (error) {
            console.error(`[TitleWorker] Failed to update title for ${chatId}:`, error);
            return;
        }


        // 📡 BROADCAST: Notify frontend via WebSocket
        // Fetch owner from conversation if userId not provided
        let ownerUserId = userId;
        if (!ownerUserId) {
            const { data: conv } = await supabase
                .from('conversations')
                .select('user_id')
                .eq('id', chatId)
                .single();
            ownerUserId = conv?.user_id;
        }

        if (ownerUserId) {
            await broadcastConversationUpdate(supabase, chatId, ownerUserId, {
                title: cleanTitle,
                updated_at: updatedAt
            });
        }

    } catch (e: any) {
        // Log but don't crash - this is a background worker
        console.error(`[TitleWorker] ❌ Failed to generate/persist title:`, e);
    }
}
