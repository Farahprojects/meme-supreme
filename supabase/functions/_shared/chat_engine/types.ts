import type { SupabaseClient } from "../types.ts";

export interface StreamingChatParams {
    chat_id: string;
    user_id: string;
    text: string;
    mode?: string | undefined;
    system_overlay?: string | undefined;
    role?: string | undefined;
    cache_data?: { cache_name: string; expires_at: string; system_data_hash: string } | null | undefined;
}

export interface StreamingChatVoiceParams extends StreamingChatParams {
    voice_session_id: string;
    turnId?: string | undefined;
    voice?: string | undefined;
}

export interface StreamingChatOptions {
    signal?: AbortSignal | undefined;
    onChunk?: (text: string, variant?: string) => void | Promise<void>;
    requestId?: string | undefined;
}

export interface LoadedChatContext {
    targetGeminiModel: string;
    fallbackModel: string;
    useAlternateModel: boolean;
    effectiveCache: string | null;
    contents: { role: string; parts: { text: string }[] }[];
    combinedSystemInstruction: string;
    streamOpts: any;
    experimentConfig: Record<string, unknown> | null;
    isEligibleForABResponse: boolean;
    isEligibleForResonance: boolean;
    dateContext: string;
    systemText: string;
}
