import type { SupabaseClient } from "../types.ts";
import type { LlmResponse } from "../llmService.ts";
import { GeminiService } from "../llmService.ts";
import { XaiService } from "../xaiService.ts";
import { MistralService } from "../mistralService.ts";
import { SupabaseCircuitBreaker } from "../circuitBreaker.ts";
import { batchLogCostEvents, logCostEvent } from "../costLogger.ts";

import type { StreamingChatParams, StreamingChatOptions, StreamingChatVoiceParams } from "./types.ts";
import { loadChatContext } from "./contextLoader.ts";
import { getABResponseParams, getResonanceParams, storeExperimentMessage, fetchPlaceboAstroData } from "./experimentService.ts";
import { streamOrGenerate, runStreamWithTools } from "./streamExecutor.ts";
import { VoiceIngestClient } from "./voiceIngest.ts";
import { optimizeSwissData } from "../astroContextService.ts";

const llmService = new GeminiService();
const xaiService = new XaiService();
const mistralService = new MistralService();

function getServiceForModel(modelName: string) {
    if (modelName.includes("grok")) return xaiService as any;
    if (modelName.includes("mistral")) return mistralService as any;
    return llmService;
}

const FRIENDLY_ERROR = "Therai is busy right now. Please try again in a moment.";

export async function runStreamingChatForResponse(
    supabase: SupabaseClient,
    params: StreamingChatParams,
    options: StreamingChatOptions = {}
): Promise<LlmResponse & { modelUsed?: string }> {
    const { chat_id, user_id, text, mode, role } = params;
    const { signal, onChunk = () => { }, requestId = "" } = options;

    const circuitBreaker = new SupabaseCircuitBreaker(supabase);
    const modelsConfig = await circuitBreaker.selectActiveModels();

    const ctx = await loadChatContext(supabase, params, {
        requestId,
        isVoiceRequest: false,
        activeModel: modelsConfig.activeModel,
        fallbackModel: modelsConfig.fallbackModel || "grok-4-1-fast-non-reasoning-latest"
    });

    const forceNonStreaming = false;

    if (ctx.isEligibleForABResponse) {
        try {
            supabase.from("profiles").update({ ab_last_test_id: ctx.experimentConfig!.ab_test_active_id }).eq("id", user_id).then();

            const pA = getABResponseParams(ctx.streamOpts, 'A', ctx.experimentConfig);
            const pB = getABResponseParams(ctx.streamOpts, 'B', ctx.experimentConfig);
            const [responseA, responseB] = await Promise.all([
                streamOrGenerate(getServiceForModel((pA as any).model), ctx.contents, ctx.combinedSystemInstruction, pA, (t) => onChunk(t, 'A'), signal, forceNonStreaming) as Promise<LlmResponse>,
                streamOrGenerate(getServiceForModel((pB as any).model), ctx.contents, ctx.combinedSystemInstruction, pB, (t) => onChunk(t, 'B'), signal, forceNonStreaming) as Promise<LlmResponse>
            ]);

            return { text: "", usage: responseA.usage, experimentData: { type: 'ab_response', textA: responseA.text || "", textB: responseB.text || "" }, modelUsed: ctx.targetGeminiModel };
        } catch (e) {
            console.error('[chat_engine] A/B experiment failed:', e);
        }
    }

    if (ctx.isEligibleForResonance) {
        try {
            const resonanceBase = `${ctx.dateContext}\\n\\n[System Data]\\n${ctx.systemText}\\n\\n[Instructions]\\nInterpret energy signals.`;

            let instructionA = resonanceBase;
            let instructionB = resonanceBase;

            const placeboData = await fetchPlaceboAstroData(requestId);
            if (placeboData) {
                instructionB += `\\n\\nUse the following astrological placements instead: ${JSON.stringify(optimizeSwissData(placeboData))}`;
            }

            const rA = getResonanceParams(ctx.streamOpts, 'A', ctx.experimentConfig);
            const rB = getResonanceParams(ctx.streamOpts, 'B', ctx.experimentConfig);
            const [responseA, responseB] = await Promise.all([
                streamOrGenerate(getServiceForModel(rA.model), ctx.contents, instructionA, rA, (t) => onChunk(t, 'A'), signal, forceNonStreaming) as Promise<LlmResponse>,
                streamOrGenerate(getServiceForModel(rB.model), ctx.contents, instructionB, rB, (t) => onChunk(t, 'B'), signal, forceNonStreaming) as Promise<LlmResponse>
            ]);

            return { text: "", usage: responseA.usage, experimentData: { type: 'resonance', textA: responseA.text || "", textB: responseB.text || "" }, modelUsed: ctx.targetGeminiModel };
        } catch (e) {
            console.error('[chat_engine] Resonance experiment failed:', e);
        }
    }

    if (ctx.useAlternateModel) {
        try {
            let activeService = getServiceForModel(ctx.targetGeminiModel);
            const streamRes = await runStreamWithTools(supabase, ctx.contents, ctx.streamOpts, activeService, ctx.combinedSystemInstruction, ctx.effectiveCache, chat_id, user_id, mode, requestId, signal, forceNonStreaming, onChunk);
            return { ...streamRes, modelUsed: ctx.targetGeminiModel };
        } catch (e) {
            return { text: FRIENDLY_ERROR, usage: { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 }, modelUsed: ctx.targetGeminiModel };
        }
    }

    let fallbackService = getServiceForModel(ctx.fallbackModel);

    if (modelsConfig.activeModel === null && !ctx.useAlternateModel) {
        try {
            const fallbackOpts = { ...ctx.streamOpts, model: ctx.fallbackModel, maxOutputTokens: 11000, tools: undefined, toolConfig: undefined };
            const fallbackRes = await fallbackService.generateContent(ctx.contents, ctx.combinedSystemInstruction, fallbackOpts);
            if (fallbackRes.text && onChunk) onChunk(fallbackRes.text);
            return { ...fallbackRes, modelUsed: ctx.fallbackModel };
        } catch (e) {
            return { text: FRIENDLY_ERROR, usage: { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 }, modelUsed: ctx.fallbackModel };
        }
    }

    try {
        let activeService = getServiceForModel(ctx.targetGeminiModel);
        const streamRes = await runStreamWithTools(supabase, ctx.contents, ctx.streamOpts, activeService, ctx.combinedSystemInstruction, ctx.effectiveCache, chat_id, user_id, mode, requestId, signal, forceNonStreaming, onChunk);
        await circuitBreaker.recordModelSuccess(ctx.targetGeminiModel);
        return { ...streamRes, modelUsed: ctx.targetGeminiModel };
    } catch (errStage1: any) {
        await circuitBreaker.recordModelFailure(ctx.targetGeminiModel);
        try {
            const fallbackOpts = { ...ctx.streamOpts, model: ctx.fallbackModel, maxOutputTokens: 11000, tools: undefined, toolConfig: undefined };
            const fallbackRes = await fallbackService.generateContent(ctx.contents, ctx.combinedSystemInstruction, fallbackOpts);
            if (fallbackRes.text && onChunk) onChunk(fallbackRes.text);
            return { ...fallbackRes, modelUsed: ctx.fallbackModel };
        } catch (errStage2: any) {
            return { text: FRIENDLY_ERROR, usage: { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 }, modelUsed: ctx.fallbackModel };
        }
    }
}

export async function runStreamingChatForVoice(
    supabase: SupabaseClient,
    params: StreamingChatVoiceParams,
    options: { requestId?: string; signal?: AbortSignal } = {}
): Promise<{ text: string; usage: LlmResponse["usage"] }> {
    const { chat_id, user_id, text, voice_session_id, turnId, voice } = params;
    const { requestId = "", signal } = options;

    const circuitBreaker = new SupabaseCircuitBreaker(supabase);
    const modelsConfig = await circuitBreaker.selectActiveModels();

    const ctx = await loadChatContext(supabase, params, {
        requestId,
        isVoiceRequest: true,
        activeModel: modelsConfig.activeModel,
        fallbackModel: modelsConfig.fallbackModel || "grok-4-1-fast-non-reasoning-latest"
    });

    const voiceName = voice || "Puck";
    const effectiveTurnId = turnId || crypto.randomUUID();
    const voiceClient = new VoiceIngestClient(voice_session_id, effectiveTurnId, voiceName);

    let llmResponse: LlmResponse;

    if (ctx.useAlternateModel) {
        try {
            const activeService = getServiceForModel(ctx.targetGeminiModel);
            const streamRes = await streamOrGenerate(activeService, ctx.contents, ctx.combinedSystemInstruction, ctx.streamOpts, voiceClient.streamOnChunk, signal, false, false);
            llmResponse = { text: streamRes.text, usage: streamRes.usage ?? { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 } };
        } catch (e) {
            llmResponse = { text: FRIENDLY_ERROR, usage: { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 } };
        }
    } else {
        const fallbackService = getServiceForModel(ctx.fallbackModel);

        if (modelsConfig.activeModel === null) {
            try {
                const fallbackOpts = { ...ctx.streamOpts, model: ctx.fallbackModel, maxOutputTokens: 11000 };
                const fallbackRes = await fallbackService.generateContent(ctx.contents, ctx.combinedSystemInstruction, fallbackOpts);
                if (fallbackRes.text) voiceClient.streamOnChunk(fallbackRes.text);
                llmResponse = { text: fallbackRes.text, usage: fallbackRes.usage ?? { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 } };
            } catch (err: any) {
                llmResponse = { text: FRIENDLY_ERROR, usage: { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 } };
            }
        } else {
            const geminiOpts = { ...ctx.streamOpts, model: modelsConfig.activeModel };
            try {
                const activeVoiceService = getServiceForModel(modelsConfig.activeModel);
                const res = await streamOrGenerate(activeVoiceService, ctx.contents, ctx.combinedSystemInstruction, geminiOpts, voiceClient.streamOnChunk, signal, false, false);
                await circuitBreaker.recordModelSuccess(modelsConfig.activeModel);
                llmResponse = { ...res, usage: res.usage ?? { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 } };
            } catch (errStage1: any) {
                await circuitBreaker.recordModelFailure(modelsConfig.activeModel);
                try {
                    const fallbackOpts = { ...ctx.streamOpts, model: ctx.fallbackModel, maxOutputTokens: 11000 };
                    const fallbackRes = await fallbackService.generateContent(ctx.contents, ctx.combinedSystemInstruction, fallbackOpts);
                    if (fallbackRes.text) voiceClient.streamOnChunk(fallbackRes.text);
                    llmResponse = { text: fallbackRes.text, usage: fallbackRes.usage ?? { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 } };
                } catch (errStage2: any) {
                    llmResponse = { text: FRIENDLY_ERROR, usage: { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 } };
                }
            }
        }
    }

    const assistantText = llmResponse.text ?? "";
    const usage = llmResponse.usage ?? { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 };

    await voiceClient.finalize(assistantText);

    await batchLogCostEvents(supabase, [{
        source: "chat_page_llm", modality: "text", model: ctx.targetGeminiModel,
        user_id, chat_id, request_id: requestId, input_units: usage.prompt_tokens, output_units: usage.candidates_tokens,
    }]).catch(() => { });

    if (assistantText.length > 0) {
        await logCostEvent(supabase, { source: "tts", modality: "audio", model: "google-tts", input_units: assistantText.length, output_units: 0, user_id, chat_id }).catch(() => { });
    }

    return { text: assistantText, usage };
}
