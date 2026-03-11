import type { SupabaseClient } from "./types.ts";

/**
 * Standardized manager for UI status updates and placeholders.
 * Keeps specific UI logic out of the main LLM handlers.
 */
export async function sendPlaceholder(
    supabase: SupabaseClient,
    params: {
        chatId: string;
        userId: string;
        type: 'image_generation' | 'voice_processing' | 'thinking';
        meta?: Record<string, unknown>;
        id?: string; // Optional: allow passing a pre-generated ID
    }
): Promise<string> {
    const messageId = params.id || crypto.randomUUID();
    let text = "";
    const status = "pending";
    const meta = { ...params.meta };

    // Configure placeholder based on type
    // Crucial: Text should NOT be empty if we want to force UI rendering in some frontends
    switch (params.type) {
        case 'image_generation':
            text = "";
            meta.status = 'generating';
            meta.message_type = 'image';
            break;

        // Future placeholders can be added here
        case 'voice_processing':
            text = "Processing audio...";
            meta.status = 'processing';
            break;

        case 'thinking':
            text = "Thinking...";
            meta.status = 'thinking';
            break;
    }

    // Build the complete message object for DB and broadcast
    const message = {
        id: messageId,
        chat_id: params.chatId,
        user_id: params.userId,
        role: 'assistant',
        text: text,
        status: status,
        meta: meta,
        created_at: new Date().toISOString()
    };

    // Insert to database
    const { error } = await supabase.from('messages').insert(message);

    if (error) {
        console.warn(`[uiStatusManager] Failed to insert placeholder: ${error.message}`);
    } else {
        console.log(`[uiStatusManager] Sent placeholder for ${params.type} (id: ${messageId})`);

        // 🔥 CRITICAL FIX: Broadcast to frontend immediately
        try {
            const channel = supabase.channel(`user-realtime:${params.userId}`);
            await channel.send(
                { type: 'broadcast', event: 'message-insert', payload: { chat_id: params.chatId, message } },
                { httpSend: true }
            );
            await supabase.removeChannel(channel);
            console.log(`[uiStatusManager] Broadcast placeholder to user ${params.userId}`);
        } catch (broadcastError) {
            console.warn(`[uiStatusManager] Broadcast failed:`, broadcastError);
        }
    }

    return messageId;
}
