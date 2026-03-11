// supabase/functions/_shared/conversationService.ts

import type { SupabaseClient } from "./types.ts";
import { checkLimit } from "./limitChecker.ts";
import { getInternalCallHeaders } from "./authHelper.ts";

// Constants
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Types
export interface ConversationCreationParams {
    id: string;
    userId: string;
    mode: string;
    title?: string | undefined;
    folderId?: string | undefined;
    profileId?: string | undefined;
    personBProfileId?: string | undefined;
    personALogId?: string | undefined;
    personBLogId?: string | undefined;
    personAName?: string | undefined;
    personBName?: string | undefined;
    reportData?: Record<string, unknown> | undefined;
    email?: string | undefined;
    name?: string | undefined;
    profileMode?: boolean | undefined;
    profileChatId?: string | undefined;
    isResonanceTest?: boolean | undefined;
}

/**
 * Ensures a conversation exists by upserting it.
 * Used to handle race conditions and centralize creation logic.
 * Ported from conversationHelper.ts
 */
export async function ensureConversation(
    supabase: SupabaseClient,
    params: ConversationCreationParams,
    requestId: string
): Promise<{ id: string; mode: string; user_id: string; isNew: boolean; context_injected: boolean }> {
    const { id, userId, mode, title, folderId, profileId, personBProfileId, reportData, email, name, profileMode, personALogId, personBLogId, personAName, personBName, isResonanceTest } = params;

    // INVARIANT: chat, together, and resonance modes MUST have a profile_id (Person A)
    if ((mode === 'chat' || mode === 'together' || mode === 'resonance') && !profileId) {
        console.error(`[${requestId}] ❌ STABILITY INVARIANT FAILED: profileId is required for mode ${mode}`);
        throw new Error(`Architectural Error: profileId is required for ${mode} conversations. Please ensure a profile is selected.`);
    }

    const meta: Record<string, unknown> = {};
    if (reportData) {
        meta.report_payload = {
            report_data: reportData,
            email: email || '',
            name: name || '',
            submitted_at: new Date().toISOString(),
        };
    }
    if (profileMode) {
        meta.profile_mode = true;
    }

    // Standardize log ID storage is now handled by direct columns


    // Attempt upsert - include context_injected in select for optimization
    const { data: created, error } = await supabase
        .from('conversations')
        .upsert({
            id,
            user_id: userId,
            owner_user_id: userId,
            title: title || 'New Chat',
            mode: mode,
            folder_id: folderId || null,
            profile_id: profileId || null,
            person_b_profile_id: personBProfileId || null,
            meta: meta,
            // Explicit Person Context Persistence (legacy log IDs for display)
            person_a_log_id: personALogId || null,
            person_b_log_id: personBLogId || null,
            person_a_name: personAName || null,
            person_b_name: personBName || null,
            // New conversations start without context
            context_injected: false,
            is_resonance_test: isResonanceTest || false,
        }, {
            onConflict: 'id',
            ignoreDuplicates: true
        })
        .select('id, mode, user_id, context_injected')
        .maybeSingle();

    // Handle upsert errors
    if (error) {
        throw new Error(`Failed to ensure conversation: ${error.message}`);
    }

    // If upsert returned data, it's a NEW conversation
    if (created) {
        if (created.user_id !== userId) {
            throw new Error("Access denied: Conversation owned by another user");
        }
        return { ...created, isNew: true, context_injected: created.context_injected ?? false };
    }

    // Optimization: If we trust this is a new UUID (passed from client/caller as such),
    // and upsert didn't return data (meaning conflict on ID), it's an edge case collision but we can still fetch.
    // However, for the 'chat-send' optimization flow, we rely on the upsert returning data for new chats.
    // If it didn't return data, it means the row existed.

    // Row already exists - fetch it with context_injected
    const { data: existing, error: fetchError } = await supabase
        .from('conversations')
        .select('id, mode, user_id, context_injected')
        .eq('id', id)
        .single();

    if (fetchError || !existing) {
        throw new Error(`Failed to fetch existing conversation: ${fetchError?.message || 'Not found'}`);
    }

    // Security check
    if (existing.user_id !== userId) {
        throw new Error("Access denied: Conversation owned by another user");
    }

    return { ...existing, isNew: false };
}

/**
 * Handles full conversation creation logic including limits and side effects.
 * Ported from conversation-manager create_conversation handler
 */
export async function createConversationService(
    supabase: SupabaseClient,
    // admin client needed for checkLimit if usage table policies require it, 
    // but usually user client is fine if RLS allows reading usage. 
    // Assuming passed client has necessary perms.
    params: ConversationCreationParams,
    requestId: string
) {
    const { mode, folderId, profileMode, reportData, email, name, id, userId } = params;

    if (!mode) throw new Error('mode is required for conversation creation');

    // ✅ meme can only be created from UI left panel (meme button) - NOT from folders
    if (mode === 'meme' && folderId) {
        throw new Error('Meme conversations cannot be created in folders. Please use the meme button from the left panel.');
    }

    // ✅ Check image generation limit for meme mode (6 images per day)
    if (mode === 'meme') {
        const limitCheck = await checkLimit(supabase, userId, 'image_generation', 1);

        if (!limitCheck.allowed || (limitCheck.current_usage !== undefined && limitCheck.current_usage >= 6)) {
            throw new Error('Daily limit exceeded. You\'ve used 6 images today. Try again tomorrow or upgrade for unlimited access.');
        }
    }

    // Call ensureConversation
    const data = await ensureConversation(supabase, params, requestId);

    // Profile mode: Skip messages table insertion, but call translator-edge for chart generation
    if (profileMode) {

        // Call initiate-auth-report (which will call translator-edge)
        if (reportData) {
            const payload = {
                chat_id: id,
                report_data: reportData,
                email: email || '',
                name: name || '',
                mode: 'profile',
            };
            // Fire and forget
            fetch(`${SUPABASE_URL}/functions/v1/initiate-auth-report`, {
                method: 'POST',
                headers: getInternalCallHeaders(userId),
                body: JSON.stringify(payload),
            }).catch((e) => console.error(`[${requestId}] initiate-auth-report error`, e));
        }
    }

    return data;
}

export async function updateConversationProfileService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string,
    profileId: string
) {
    // Verify profile belongs to user
    const { data: profile, error: profileError } = await supabase
        .from('user_profile_list')
        .select('user_id')
        .eq('id', profileId)
        .single();

    if (profileError || !profile) {
        throw new Error('Profile not found');
    }

    if (profile.user_id !== userId) {
        throw new Error('Profile does not belong to user');
    }

    // Update the conversation's active person explicitly
    const { error: updateError } = await supabase
        .from('conversations')
        .update({
            profile_id: profileId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('user_id', userId);

    if (updateError) {
        throw new Error(`Failed to update profile: ${updateError.message}`);
    }
}

export async function updateConversationTitleService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string,
    title: string
) {
    const { error } = await supabase
        .from('conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_id', userId);

    if (error) {
        throw new Error(`Failed to update title: ${error.message}`);
    }
}

export async function deleteConversationService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string
) {
    // Ensure ownership
    const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id, owner_user_id')
        .eq('id', conversationId)
        .single();

    if (convErr || !conv) throw new Error('Conversation not found');

    if (conv.owner_user_id !== userId) throw new Error('Only the owner can delete the conversation');

    const [{ error: msgErr }, { error: convErr2 }] = await Promise.all([
        supabase.from('messages').delete().eq('chat_id', conversationId),
        supabase.from('conversations').delete().eq('id', conversationId).eq('owner_user_id', userId),
    ]);

    if (msgErr || convErr2) throw new Error('Failed to delete conversation');
}

export async function shareConversationService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string
) {
    const { error } = await supabase
        .from('conversations')
        .update({ is_public: true, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('owner_user_id', userId);

    if (error) throw new Error('Failed to share conversation');

    await supabase
        .from('conversations_participants')
        .upsert(
            { conversation_id: conversationId, user_id: userId, role: 'owner' },
            { onConflict: 'conversation_id,user_id' },
        );
}

export async function unshareConversationService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string
) {
    const { error } = await supabase
        .from('conversations')
        .update({ is_public: false, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('owner_user_id', userId);

    if (error) throw new Error('Failed to unshare conversation');
}

export async function joinConversationService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string
) {
    const { data: conv, error } = await supabase
        .from('conversations')
        .select('id, is_public')
        .eq('id', conversationId)
        .eq('is_public', true)
        .single();

    if (error || !conv) throw new Error('Conversation not found or not public');

    await supabase
        .from('conversations_participants')
        .upsert(
            { conversation_id: conversationId, user_id: userId, role: 'member' },
            { onConflict: 'conversation_id,user_id' },
        );
}

export async function listConversationsService(
    supabase: SupabaseClient,
    userId: string
) {
    const [{ data: owned, error: ownedErr }, { data: shared, error: sharedErr }] = await Promise.all([
        supabase
            .from('conversations')
            .select('id, title, created_at, updated_at, meta, is_public, mode, folder_id, profile_id, person_a_log_id, person_a_name, person_b_profile_id, person_b_log_id, person_b_name')
            .eq('user_id', userId)
            .is('folder_id', null) // Exclude folder-owned conversations from history
            .order('updated_at', { ascending: false }),
        supabase
            .from('conversations')
            .select('id, title, created_at, updated_at, meta, is_public, mode, folder_id, profile_id, person_a_log_id, person_a_name, person_b_profile_id, person_b_log_id, person_b_name, conversations_participants!inner(role)')
            .eq('conversations_participants.user_id', userId)
            .is('folder_id', null) // Exclude folder-owned conversations from history
            .order('updated_at', { ascending: false }),
    ]);

    if (ownedErr || sharedErr) {
        throw new Error('Failed to list conversations');
    }

    // Merge and dedupe by id (shared takes precedence)
    const map = new Map<string, any>();
    for (const c of shared || []) map.set(c.id, c);
    for (const c of owned || []) if (!map.has(c.id)) map.set(c.id, c);

    const conversations = Array.from(map.values()).sort(
        (a: { updated_at: string }, b: { updated_at: string }) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    return conversations;
}

export async function updateConversationActivityService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string,
    title?: string
) {
    const { error } = await supabase
        .from('conversations')
        .update({
            updated_at: new Date().toISOString(),
            ...(title ? { title } : {}),
        })
        .eq('id', conversationId)
        .eq('user_id', userId);

    if (error) {
        throw new Error(`Failed to update activity: ${error.message}`);
    }
}

export async function getConversationService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string
) {
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        throw new Error('Conversation not found or access denied');
    }
    return data;
}

/**
 * Updates person B on an existing conversation.
 * Used by Together Space to add a second person after initial creation.
 */
export async function updatePersonBService(
    supabase: SupabaseClient,
    userId: string,
    conversationId: string,
    personBLogId: string,
    personBName: string,
    personBProfileId?: string
) {
    // Verify ownership
    const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id, owner_user_id')
        .eq('id', conversationId)
        .single();

    if (convErr || !conv) {
        throw new Error('Conversation not found');
    }

    if (conv.owner_user_id !== userId) {
        throw new Error('Only the owner can update person B');
    }

    const { error } = await supabase
        .from('conversations')
        .update({
            person_b_log_id: personBLogId,
            person_b_name: personBName,
            person_b_profile_id: personBProfileId ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('owner_user_id', userId);

    if (error) {
        throw new Error(`Failed to update person B: ${error.message}`);
    }
}
