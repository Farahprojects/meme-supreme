// supabase/functions/_shared/llmService.ts

import { getGoogleApiKey, getModel } from "./geminiConfig.ts";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface GeminiConfig {
    model?: string | undefined;
    temperature?: number | undefined;
    maxOutputTokens?: number | undefined;
    /** For JSON mode: "application/json" */
    responseMimeType?: string | undefined;
    /** For Gemini 3.x models - use thinking_level */
    thinkingLevel?: ThinkingLevel | undefined;
    /** For Gemini 2.5 models - use thinking_budget (0 = off) */
    thinkingBudget?: number | undefined;
    apiKey?: string | undefined;
    tools?: GeminiTool[] | undefined;
    toolConfig?: GeminiToolConfig | undefined;
    cachedContent?: string | undefined;
    maxRetries?: number | undefined;
    /** Override timeout in ms. Set to 0 to disable timeout for this call. */
    timeoutMs?: number | undefined;
}

export interface LlmResponse {
    text: string;
    usage: {
        total_tokens: number;
        prompt_tokens: number;
        candidates_tokens: number;
        cached_tokens?: number;
    };
    /** Gemini finish reason: STOP, MAX_TOKENS, SAFETY, OTHER, etc. */
    finishReason?: string | undefined;
    /** Set when the model returned a function call (e.g. search_web). Caller should execute and continue the turn. */
    functionCall?: { name: string; args: Record<string, unknown> } | undefined;
    /** Raw part(s) from the model response (include thoughtSignature for Gemini 3). Use as role=model parts when sending the follow-up request. */
    functionCallParts?: GeminiContentPart[] | undefined;
    raw?: GeminiRawResponse | undefined;
    /** Set when the streaming helper dispatched an image generation tool call. */
    imageDispatch?: boolean;
    /** Set when the response is part of an A/B experiment. */
    experimentData?: {
        type: 'ab_response' | 'resonance';
        textA: string;
        textB: string;
    };
}

export interface ThoughtStep {
    goal: string;
    reasoning: string;
    next_step: string | null;
    confidence: number;
    final_answer: string | null;
}

export interface DeepThinkResult {
    thought: ThoughtStep;
    usage: LlmResponse["usage"];
    isComplete: boolean;
}

// Gemini API types
interface GeminiFunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
    };
}

interface GeminiTool {
    functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiToolConfig {
    functionCallingConfig: {
        mode: "AUTO" | "ANY" | "NONE";
        allowedFunctionNames?: string[];
    };
}

interface GeminiContentPart {
    text?: string;
    functionCall?: {
        name: string;
        args: Record<string, unknown>;
    };
}

interface GeminiCandidate {
    content: {
        parts: GeminiContentPart[];
    };
    finishReason?: string;
}

export interface GeminiContent {
    role: string;
    parts: GeminiContentPart[];
}

interface GeminiRawResponse {
    candidates?: GeminiCandidate[];
    usageMetadata?: {
        totalTokenCount?: number;
        promptTokenCount?: number;
        candidatesTokenCount?: number;
    };
}

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TIMEOUT_MS = 15_000;
/** Streaming: abort only if no first token within this time. No total-stream cap. */
const FIRST_BYTE_TIMEOUT_MS = 8_000;

/** Parse one Gemini SSE event; returns chunk text, usage, finishReason, and any functionCall part. */
function parseStreamEvent(data: GeminiRawResponse): {
    chunkText: string;
    usage?: LlmResponse["usage"];
    finishReason?: string;
    parts?: GeminiContentPart[];
} {
    const content = data?.candidates?.[0]?.content;
    const parts = content?.parts ?? [];
    const chunkText = parts
        .filter((p: any) => typeof p?.text === "string")
        .map((p: any) => p.text)
        .join("") ?? "";
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (data?.usageMetadata) {
        const usage = {
            total_tokens: data.usageMetadata.totalTokenCount ?? 0,
            prompt_tokens: data.usageMetadata.promptTokenCount ?? 0,
            candidates_tokens: data.usageMetadata.candidatesTokenCount ?? 0,
        };
        if (finishReason) {
            return { chunkText, usage, finishReason, parts };
        } else {
            return { chunkText, usage, parts };
        }
    }

    if (finishReason) {
        return { chunkText, finishReason, parts };
    }

    return { chunkText, parts };
}

const DEEP_THINK_TOOL = [{
    functionDeclarations: [{
        name: "record_thought",
        description: "Record your current reasoning step. You MUST use this tool to structure your thinking.",
        parameters: {
            type: "object",
            properties: {
                goal: {
                    type: "string",
                    description: "The user's original question/goal - keep this consistent across iterations"
                },
                reasoning: {
                    type: "string",
                    description: "Your current analysis and thinking about this step. Be thorough."
                },
                next_step: {
                    type: "string",
                    description: "What you need to think about next to answer the goal. Set to null if you're ready to answer."
                },
                confidence: {
                    type: "integer",
                    description: "How confident are you (0-100) that you can answer the user accurately RIGHT NOW without more thinking?"
                },
                final_answer: {
                    type: "string",
                    description: "Your final answer to give the user. ONLY provide this when confidence >= 95 or you have nothing left to analyze."
                }
            },
            required: ["goal", "reasoning", "confidence"]
        }
    }]
}];

/**
 * Get current date for deep thinking temporal awareness
 */
function getDeepThinkDateContext(): string {
    const now = new Date();
    return `Current Date: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })})`;
}

const DEEP_THINK_PROMPT = `You are in DEEP THINKING mode. Your task is to reason through the user's question step by step until you're confident you can answer accurately.

## TEMPORAL AWARENESS - CRITICAL
${getDeepThinkDateContext()}
Always anchor your analysis to this date. Past events are BEHIND this date. Future events are AFTER this date.
Never assume a past date is upcoming or a future date has already occurred.

## HOW THIS WORKS
1. You will be shown the user's question and any previous thinking steps
2. You MUST call the record_thought tool to log your current reasoning
3. Keep thinking until confidence >= 95 OR you've exhausted all angles to analyze

## THE record_thought TOOL
This is your ONLY way to communicate in deep thinking mode. You must use it for EVERY response.
- It structures your thinking into discrete steps
- It tracks your confidence until you're ready to answer
- Your final_answer is what the user will actually see

## RULES FOR EACH THOUGHT
- goal: Always restate the user's original question (keep it consistent)
- reasoning: Your analysis for THIS step - what are you figuring out? What connections are you making?
- next_step: What do you still need to consider? (null if you're done thinking)
- confidence: Be honest - only high confidence if you're truly ready to answer well
- final_answer: ONLY provide when confident. This is what the user will see.

## CONFIDENCE GUIDELINES
- 0-30: Just started, need more analysis
- 31-60: Making progress, but gaps remain
- 61-80: Good understanding, checking edge cases
- 81-94: Almost ready, final verification
- 95-100: Ready to answer accurately

## REMEMBER
- Don't rush to answer - it's better to think thoroughly
- Each thought should BUILD on previous ones
- When you set final_answer, make it complete and well-structured
- Always check dates against the CURRENT DATE above before making temporal claims`;

/**
 * Professional LLM Service for Gemini interactions.
 * Centralizes retries, error handling, and response parsing.
 */
export class GeminiService {
    private apiKey: string;
    private baseUrl = "https://generativelanguage.googleapis.com/v1beta";

    constructor(apiKey?: string) {
        this.apiKey = apiKey || getGoogleApiKey();
        if (!this.apiKey) {
            console.warn("[GeminiService] No API key provided or found in environment.");
        }
    }

    /**
     * Deep thinking method - iterative reasoning with structured output
     */
    async deepThink(
        goal: string,
        previousThoughts: ThoughtStep[],
        systemContext: string,
        config: GeminiConfig = {}
    ): Promise<DeepThinkResult> {
        // Build the thinking context
        let thinkingContext = `${DEEP_THINK_PROMPT}\n\n## USER'S QUESTION\n${goal}`;

        if (systemContext) {
            thinkingContext += `\n\n## CONTEXT\n${systemContext}`;
        }

        if (previousThoughts.length > 0) {
            thinkingContext += `\n\n## YOUR PREVIOUS THOUGHTS\n`;
            previousThoughts.forEach((t, i) => {
                thinkingContext += `\n### Thought ${i + 1} (Confidence: ${t.confidence}%)\n`;
                thinkingContext += `Reasoning: ${t.reasoning}\n`;
                if (t.next_step) {
                    thinkingContext += `Next to consider: ${t.next_step}\n`;
                }
            });
            thinkingContext += `\n\n## YOUR TASK NOW\nContinue from where you left off. What's your next reasoning step?`;
        } else {
            thinkingContext += `\n\n## YOUR TASK NOW\nBegin analyzing this question. What's your first reasoning step?`;
        }

        const contents = [{ role: "user", parts: [{ text: thinkingContext }] }];

        const response = await this.generateContent(contents, undefined, {
            ...config,
            tools: DEEP_THINK_TOOL,
            toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["record_thought"] } }
        });

        // Extract the function call
        const functionCall = response.raw?.candidates?.[0]?.content?.parts?.find(
            (p: any) => p?.functionCall
        )?.functionCall;

        if (!functionCall || functionCall.name !== "record_thought") {
            // Fallback if model didn't use the tool
            console.warn("[GeminiService] Model didn't use record_thought tool, creating fallback");
            return {
                thought: {
                    goal,
                    reasoning: response.text || "Unable to extract reasoning",
                    next_step: null,
                    confidence: 95,
                    final_answer: response.text || "I apologize, I had trouble processing that."
                },
                usage: response.usage,
                isComplete: true
            };
        }

        const args = functionCall.args || {};
        const thought: ThoughtStep = {
            goal: (args.goal as string) || goal,
            reasoning: (args.reasoning as string) || "",
            next_step: (args.next_step as string) || null,
            confidence: Math.min(100, Math.max(0, parseInt(args.confidence as string) || 0)),
            final_answer: (args.final_answer as string) || null
        };

        const isComplete = thought.confidence >= 95 || thought.final_answer !== null || thought.next_step === null;

        return {
            thought,
            usage: response.usage,
            isComplete
        };
    }

    /**
     * Check if a question requires deep thinking
     */
    async requiresDeepThinking(question: string): Promise<boolean> {
        const checkPrompt = `Analyze this user message and determine if it requires deep reasoning.

REQUIRES DEEP THINKING (return YES):
- Complex multi-part questions
- Questions asking for analysis, comparison, or evaluation
- Questions about relationships, patterns, or connections
- Questions that could have multiple valid answers
- Questions requiring weighing pros/cons
- Personal growth or self-reflection questions
- Questions about timing, decisions, or life choices

SIMPLE RESPONSE OK (return NO):
- Greetings ("hi", "hello", "how are you")
- Simple factual questions with one clear answer
- Requests for basic information
- Simple follow-up confirmations
- Very short casual messages

User message: "${question}"

Respond with ONLY "YES" or "NO".`;

        try {
            const response = await this.generateContent(
                [{ role: "user", parts: [{ text: checkPrompt }] }],
                undefined,
                { temperature: 0.1, maxOutputTokens: 10 }
            );
            const answer = response.text.trim().toUpperCase();
            return answer.includes("YES");
        } catch (e) {
            console.warn("[GeminiService] Complexity check failed, defaulting to false:", e);
            return false;
        }
    }

    /**
     * Main completion method with built-in retry logic.
     */
    async generateContent(
        contents: GeminiContent[],
        systemInstruction?: string,
        config: GeminiConfig = {}
    ): Promise<LlmResponse> {
        const model = config.model || getModel("chat");
        const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

        // Build thinkingConfig based on what worker provides (deterministic, no guessing)
        // - thinkingBudget: for Gemini 2.5 models (0 = off)
        // - thinkingLevel: for Gemini 3.x models
        let thinkingConfig: Record<string, unknown> | undefined;
        if (config.thinkingBudget !== undefined) {
            thinkingConfig = { thinking_budget: config.thinkingBudget };
        } else if (config.thinkingLevel) {
            thinkingConfig = { thinking_level: config.thinkingLevel };
        }
        // If neither provided, no thinkingConfig in request

        const requestBody: any = {
            contents,
            generationConfig: {
                temperature: config.temperature ?? DEFAULT_TEMPERATURE,
                maxOutputTokens: config.maxOutputTokens,
                ...(config.responseMimeType && { responseMimeType: config.responseMimeType }),
                ...(thinkingConfig && { thinkingConfig })
            }
        };

        if (config.cachedContent) {
            requestBody.cachedContent = config.cachedContent;
        }

        if (config.tools && !config.cachedContent) {
            requestBody.tools = config.tools;
        }

        if (config.toolConfig && !config.cachedContent) {
            requestBody.toolConfig = config.toolConfig;
        }

        if (systemInstruction && !config.cachedContent) {
            requestBody.system_instruction = {
                role: "system",
                parts: [{ text: systemInstruction }]
            };
        }

        const requestId = crypto.randomUUID().slice(0, 8);
        const controller = new AbortController();
        const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
            const tApi = Date.now();
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            if (timeoutId) clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => "Unknown error");
                console.error(`[GeminiService][${requestId}] API Error: ${response.status}`, errorText);

                const error = new Error(`Gemini API failed: ${response.status} ${errorText}`);
                (error as any).status = response.status;
                (error as any).reason = errorText;
                throw error;
            }

            const data = await response.json();
            const candidate = data?.candidates?.[0];

            if (!candidate) {
                throw new Error("No candidates returned from Gemini");
            }

            const text = candidate.content?.parts
                ?.filter((p: any) => typeof p.text === "string")
                .map((p: any) => p.text)
                .join(" ")
                .trim() || "";

            return {
                text,
                usage: {
                    total_tokens: data.usageMetadata?.totalTokenCount || 0,
                    prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
                    candidates_tokens: data.usageMetadata?.candidatesTokenCount || 0,
                    cached_tokens: data.usageMetadata?.cachedContentTokenCount
                },
                raw: data
            };
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            throw err;
        }
    }

    /**
     * Stream generateContent: same request as generateContent, yields text chunks via onChunk.
     * Returns full accumulated text and usage when stream ends.
     * Uses Gemini :streamGenerateContent endpoint (NDJSON response).
     * When options.signal is provided (e.g. request.signal), client disconnect aborts the fetch.
     */
    async streamGenerateContent(
        contents: GeminiContent[],
        systemInstruction?: string,
        config: GeminiConfig = {},
        onChunk: (text: string) => void | Promise<void> = () => { },
        options?: { signal?: AbortSignal }
    ): Promise<LlmResponse> {
        const model = config.model || getModel("chat");
        const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

        let thinkingConfig: Record<string, unknown> | undefined;
        if (config.thinkingBudget !== undefined) {
            thinkingConfig = { thinking_budget: config.thinkingBudget };
        } else if (config.thinkingLevel) {
            thinkingConfig = { thinking_level: config.thinkingLevel };
        }

        const requestBody: any = {
            contents,
            generationConfig: {
                temperature: config.temperature ?? DEFAULT_TEMPERATURE,
                maxOutputTokens: config.maxOutputTokens,
                ...(config.responseMimeType && { responseMimeType: config.responseMimeType }),
                ...(thinkingConfig && { thinkingConfig })
            }
        };

        if (config.cachedContent) {
            requestBody.cachedContent = config.cachedContent;
        }
        if (config.tools && !config.cachedContent) {
            requestBody.tools = config.tools;
        }
        if (config.toolConfig && !config.cachedContent) {
            requestBody.toolConfig = config.toolConfig;
        }
        if (systemInstruction && !config.cachedContent) {
            requestBody.system_instruction = {
                role: "system",
                parts: [{ text: systemInstruction }]
            };
        }

        const controller = new AbortController();
        if (options?.signal) {
            options.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        try {
            console.log(`[GeminiService][${model}] Requesting... (Thinking: ${thinkingConfig ? JSON.stringify(thinkingConfig) : 'Off'})`);
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "Unknown error");
                console.error("[GeminiService] streamGenerateContent API Error:", response.status, errorText);
                const err = new Error(`Gemini stream API failed: ${response.status} ${errorText.slice(0, 500)}`);
                (err as { status?: number, reason?: string }).status = response.status;
                (err as { status?: number, reason?: string }).reason = errorText;
                throw err;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body for stream");
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let fullText = "";
            let usage = { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 };
            let lastFinishReason: string | undefined;
            let totalBytesRead = 0;
            const accumulatedParts: any[] = [];
            let firstByteReceived = false;

            // First-byte timeout: abort if no token arrives within FIRST_BYTE_TIMEOUT_MS of stream start
            const firstByteController = new AbortController();
            const firstByteTimeoutId = setTimeout(() => {
                if (!firstByteReceived) {
                    console.warn(`[GeminiService][${model}] First-byte timeout after ${FIRST_BYTE_TIMEOUT_MS}ms — aborting stream`);
                    firstByteController.abort();
                    controller.abort();
                }
            }, FIRST_BYTE_TIMEOUT_MS);

            const processEvent = (data: any) => {
                const { chunkText, usage: u, finishReason: fr, parts: eventParts } = parseStreamEvent(data);
                if (chunkText) {
                    if (!firstByteReceived) {
                        firstByteReceived = true;
                        clearTimeout(firstByteTimeoutId);
                    }
                    fullText += chunkText;
                    void Promise.resolve(onChunk(chunkText));
                }
                if (u) Object.assign(usage, u);
                if (fr) lastFinishReason = fr;
                if (eventParts?.length) accumulatedParts.push(...eventParts);
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) totalBytesRead += value.length;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":") || trimmed === "[DONE]") continue;
                    const jsonStr = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
                    if (!jsonStr) continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        processEvent(data);
                    } catch (_) {
                        // Skip malformed lines
                    }
                }
            }

            if (buffer.trim()) {
                const trimmed = buffer.trim();
                if (trimmed !== "[DONE]") {
                    const jsonStr = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
                    if (jsonStr) {
                        try {
                            const data = JSON.parse(jsonStr);
                            processEvent(data);
                        } catch (_) {
                            // ignore
                        }
                    }
                }
            }

            if (lastFinishReason && lastFinishReason !== "STOP") {
                console.warn(`[GeminiService][${model}] Stream finished abnormally: reason=${lastFinishReason} tokens=${usage.total_tokens} candidateTokens=${usage.candidates_tokens}`);
            }
            console.log(`[GeminiService][${model}] Stream complete: finishReason=${lastFinishReason ?? "unknown"} totalTokens=${usage.total_tokens} promptTokens=${usage.prompt_tokens} candidateTokens=${usage.candidates_tokens}`);

            const functionCallPart = accumulatedParts.find((p: any) => p?.functionCall != null);
            const functionCall = functionCallPart?.functionCall
                ? { name: functionCallPart.functionCall.name ?? "search_web", args: (functionCallPart.functionCall.args as Record<string, unknown>) ?? {} }
                : undefined;

            const result: LlmResponse = { text: fullText, usage, finishReason: lastFinishReason };
            if (functionCall) {
                result.functionCall = functionCall;
                result.functionCallParts = accumulatedParts;
            }
            return result;
        } catch (err) {
            throw err;
        }
    }
}
