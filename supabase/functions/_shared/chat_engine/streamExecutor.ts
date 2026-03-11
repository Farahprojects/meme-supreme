import type { SupabaseClient } from "../types.ts";
import type { LlmResponse } from "../llmService.ts";
import { GeminiService } from "../llmService.ts";
import { handleImageToolCall } from "../imageToolHandler.ts";
import { getInternalCallHeaders } from "../authHelper.ts";

export async function streamOrGenerate(
    service: any, // GeminiService | XaiService | MistralService
    c: any[],
    instruction: string | undefined,
    opts: any,
    chunkCb: (text: string, variant?: string) => void | Promise<void>,
    signal?: AbortSignal,
    forceNonStreaming?: boolean,
    simulateStream: boolean = true
): Promise<LlmResponse> {
    if (forceNonStreaming) {
        const res = await service.generateContent(c, instruction, opts);
        if (res.text && !res.functionCall) {
            if (!simulateStream) {
                await Promise.resolve(chunkCb(res.text));
            } else {
                const chunks = res.text.match(/.{1,6}/g) || [];
                for (const chunk of chunks) {
                    if (signal?.aborted) break;
                    await new Promise(r => setTimeout(r, 10 + Math.random() * 15));
                    await Promise.resolve(chunkCb(chunk));
                }
            }
        }
        return res;
    }

    return await service.streamGenerateContent(
        c,
        instruction,
        opts,
        chunkCb,
        signal !== undefined ? { signal } : {}
    );
}

export async function runStreamWithTools(
    supabase: SupabaseClient,
    c: { role: string; parts: { text: string }[] }[],
    opts: Record<string, unknown>,
    serviceToUse: any,
    combinedSystemInstruction: string,
    effectiveCache: string | null,
    chat_id: string,
    user_id: string,
    mode: string | undefined,
    requestId: string | undefined,
    signal: AbortSignal | undefined,
    forceNonStreamFallback: boolean,
    chunkHandler: (t: string, variant?: string) => void | Promise<void>
): Promise<LlmResponse> {

    const first = await streamOrGenerate(
        serviceToUse,
        c,
        effectiveCache ? undefined : combinedSystemInstruction,
        opts as any,
        chunkHandler,
        signal,
        forceNonStreamFallback
    );

    if (!first.functionCall) return first;

    if (first.functionCall.name === "generate_image") {
        const prompt = typeof first.functionCall.args?.prompt === "string" ? first.functionCall.args.prompt.trim() : "";
        if (prompt) {
            const imageResult = await handleImageToolCall(supabase, {
                chatId: chat_id,
                userId: user_id,
                prompt,
                ...(mode !== undefined && { mode }),
                ...(requestId !== undefined && { requestId }),
            });
            return {
                text: imageResult.text || "Your image is being generated.",
                usage: first.usage ?? { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 },
                imageDispatch: true,
            };
        }
        return first;
    }

    if (first.functionCall.name !== "search_web") return first;

    const query = typeof first.functionCall.args?.query === "string" ? first.functionCall.args.query.trim() : "";
    if (!query) return first;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const searchUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/google-search` : "";
    if (!searchUrl) return first;

    const headers = getInternalCallHeaders(user_id, "llm-handler-gemini");
    let searchText = "";
    try {
        const searchRes = await fetch(searchUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ query }),
        });
        if (searchRes.ok) {
            const data = await searchRes.json();
            searchText = typeof data?.text === "string" ? data.text : "";
        }
    } catch (e) {
    }

    const modelParts = first.functionCallParts?.length ? first.functionCallParts : [{ functionCall: { name: first.functionCall.name, args: first.functionCall.args } }];
    const contentsWithSearch: { role: string; parts: any[] }[] = [
        ...c,
        { role: "model", parts: modelParts },
        {
            role: "user",
            parts: [
                {
                    functionResponse: {
                        name: first.functionCall.name,
                        response: { result: searchText || "Search returned no text." },
                    },
                },
            ],
        },
    ];

    const followUpOpts = { ...opts, tools: undefined, toolConfig: undefined } as any;
    const second = await streamOrGenerate(
        serviceToUse,
        contentsWithSearch,
        combinedSystemInstruction,
        followUpOpts,
        chunkHandler,
        signal,
        forceNonStreamFallback
    );
    return second;
}
