import type { SupabaseClient } from "../types.ts";
import { fetchAndFormatMemories } from "../memoryInjection.ts";
import { validateCache, createContextCache } from "../cacheService.ts";
import { resolveEffectiveMode, getModeConfig } from "../llmModeConfig.ts";
import { getModel, ALTERNATE_CHAT_MODEL, isEconomyPlan } from "../geminiConfig.ts";
import { HISTORY_LIMIT, SEARCH_WEB_TOOL, IMAGE_GENERATION_TOOL } from "../aiConfig.ts";
import type { StreamingChatParams, LoadedChatContext } from "./types.ts";

export function getCurrentDateContext(): string {
    const now = new Date();
    const formatted = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    return `## CURRENT DATE & TIME\nToday is: ${formatted}\nCurrent timestamp (UTC): ${now.toISOString()}\nUse this as reference. Any events before today are PAST. After are FUTURE.`;
}

export function buildContentsFromHistory(
    historyRows: { role: string; text: string }[],
    userText: string
): { role: string; parts: { text: string }[] }[] {
    const contents: { role: string; parts: { text: string }[] }[] = [];
    for (let i = historyRows.length - 1; i >= 0; i--) {
        const role = historyRows[i].role === "assistant" ? "model" : "user";
        contents.push({ role, parts: [{ text: historyRows[i].text }] });
    }
    const lastRow = historyRows[0];
    if (!(lastRow?.role === "user" && lastRow?.text === userText)) {
        contents.push({ role: "user", parts: [{ text: userText }] });
    }
    return contents;
}

export async function loadChatContext(
    supabase: SupabaseClient,
    params: StreamingChatParams,
    options: {
        requestId: string;
        isVoiceRequest: boolean;
        activeModel: string | null;
        fallbackModel: string;
    }
): Promise<LoadedChatContext> {
    const { chat_id, user_id, text, mode, system_overlay, role, cache_data: cacheDataFromChatSend } = params;
    const { requestId, isVoiceRequest, activeModel, fallbackModel } = options;

    let cachePromise: Promise<{ data: any }> = Promise.resolve({ data: null });
    if (chat_id) {
        if (cacheDataFromChatSend !== undefined) {
            cachePromise = Promise.resolve({ data: cacheDataFromChatSend });
        } else {
            cachePromise = supabase
                .from("conversation_caches")
                .select("cache_name, expires_at, system_data_hash")
                .eq("chat_id", chat_id)
                // If voice, we don't strictly filter by targetGeminiModel in the same way initially, handled below.
                .maybeSingle() as Promise<{ data: any }>;
        }
    }

    const [profileRes, systemMessageRes, conversationRes, historyRes, experimentConfigRes, userMessagesRes] = await Promise.all([
        supabase.from("profiles").select("subscription_plan, ab_response_opted_in, ab_response_completed, resonance_opted_in, resonance_completed, ab_last_test_id").eq("id", user_id).single(),
        supabase.from("messages").select("text, role, status").eq("chat_id", chat_id).eq("role", "system").eq("status", "complete").limit(1).maybeSingle(),
        supabase.from("conversations").select("turn_count, folder_id, profile_id, person_a_log_id, use_alternate_model, is_resonance_test, mode").eq("id", chat_id).single(),
        supabase.from("messages").select("role, text").eq("chat_id", chat_id).in("role", ["user", "assistant", "starter_context"]).eq("status", "complete").order("created_at", { ascending: false }).limit(HISTORY_LIMIT),
        supabase.from("experiment_config").select("*").single(),
        isVoiceRequest ? Promise.resolve({ count: 0 }) : supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user_id).eq("role", "user"),
    ]);

    const conversation = conversationRes?.data ?? null;
    const profile = profileRes?.data ?? null;
    const useEconomyPlan = isEconomyPlan(profile?.subscription_plan ?? null);
    const useConversationAlternate = conversation?.use_alternate_model === true;
    const useAlternateModel = useEconomyPlan || useConversationAlternate;
    const targetGeminiModel = useAlternateModel ? ALTERNATE_CHAT_MODEL : (activeModel || fallbackModel || getModel("chat"));

    // After resolving model, wait for specific cache data (handled in chat helper originally)
    let cacheDataRes = await cachePromise;

    const systemText = systemMessageRes?.data?.text ?? "";
    const skipCache = profile?.subscription_plan === "free";
    const historyRows = historyRes?.data ?? [];
    const cacheData = cacheDataRes?.data ?? null;
    const experimentConfig = experimentConfigRes?.data ?? null;
    const userMessageCount = userMessagesRes?.count ?? 0;

    const isEligibleForABResponse = !isVoiceRequest && (
        experimentConfig?.ab_response_enabled === true &&
        experimentConfig?.ab_test_active_id != null &&
        profile?.ab_last_test_id !== experimentConfig.ab_test_active_id &&
        userMessageCount >= 5
    );

    const isEligibleForResonance = !isVoiceRequest && (
        profile?.resonance_completed === false &&
        experimentConfig?.resonance_enabled === true
    );

    const dateContext = getCurrentDateContext();
    const effectiveMode = resolveEffectiveMode(role, mode);
    const modeConfig = getModeConfig(effectiveMode);

    const isResonanceTest = conversation?.is_resonance_test === true || conversation?.mode === 'resonance';

    let memoryContext = "";
    if (modeConfig.useMemory && chat_id && !isResonanceTest) {
        const result = await fetchAndFormatMemories(supabase, chat_id, text).catch(() => ({
            memoryContext: "",
            memoryIds: [] as string[],
        }));
        memoryContext = result.memoryContext ?? "";
    }

    let cacheName: string | null = null;
    if (chat_id && modeConfig.useCache && !skipCache && systemText && modeConfig.systemPromptForCache) {
        const cacheCheck = validateCache(cacheData, systemText, modeConfig.useMemory ? memoryContext : undefined);
        if (cacheCheck.isValid) {
            cacheName = cacheCheck.cacheName;
        } else if (cacheCheck.needsCreation) {
            const created = await createContextCache(supabase, {
                chatId: chat_id,
                model: targetGeminiModel,
                systemPrompt: modeConfig.systemPromptForCache,
                systemText,
                tools: isVoiceRequest ? undefined : [...SEARCH_WEB_TOOL, ...IMAGE_GENERATION_TOOL],
                toolConfig: isVoiceRequest ? undefined : { functionCallingConfig: { mode: "AUTO" } },
                memoryContext: modeConfig.useMemory ? memoryContext : undefined,
                requestId,
            }).catch(() => null);
            if (created) cacheName = created;
        }
    }

    const contents = isResonanceTest
        ? [{ role: "user", parts: [{ text }] }]
        : buildContentsFromHistory(historyRows, text);

    let combinedSystemInstruction = modeConfig.getSystemInstruction({
        dateContext,
        systemText,
        systemOverlay: system_overlay,
        memoryContext: modeConfig.useMemory ? memoryContext : "",
    });

    const llmConfigBase = useAlternateModel
        ? { model: ALTERNATE_CHAT_MODEL, thinkingBudget: 0, maxOutputTokens: 11000 }
        : { model: targetGeminiModel, maxOutputTokens: 11000 };

    const effectiveCache = useAlternateModel ? null : cacheName;

    let streamOpts: any;
    if (isVoiceRequest) {
        streamOpts = { ...llmConfigBase, ...(effectiveCache ? { cachedContent: effectiveCache } : {}) };
    } else {
        streamOpts = effectiveCache
            ? { ...llmConfigBase, cachedContent: effectiveCache, maxRetries: 0, chatId: chat_id }
            : {
                ...llmConfigBase,
                tools: [...SEARCH_WEB_TOOL, ...IMAGE_GENERATION_TOOL],
                toolConfig: { functionCallingConfig: { mode: "AUTO" as const } },
                maxRetries: 0,
                chatId: chat_id
            };
    }

    return {
        targetGeminiModel,
        fallbackModel,
        useAlternateModel,
        effectiveCache,
        contents,
        combinedSystemInstruction,
        streamOpts,
        experimentConfig,
        isEligibleForABResponse,
        isEligibleForResonance,
        dateContext,
        systemText
    };
}
