// supabase/functions/_shared/mistralService.ts

import type { GeminiContent, LlmResponse } from "./llmService.ts";

const DEFAULT_TIMEOUT_MS = 40_000;

/**
 * Service to handle Mistral API requests securely acting as a drop-in replacement for Gemini.
 */
export class MistralService {
    private apiKey: string;
    private baseUrl = "https://api.mistral.ai/v1/chat/completions";

    constructor() {
        this.apiKey = Deno.env.get("MISTRAL") || "";
        if (!this.apiKey) {
            console.warn("[MistralService] No MISTRAL API key found in environment.");
        }
    }

    /**
     * Translates Gemini content structure into Mistral message format (OpenAI compatible)
     */
    private translateContents(contents: GeminiContent[], systemInstruction?: string): any[] {
        const messages: any[] = [];

        if (systemInstruction) {
            messages.push({ role: "system", content: systemInstruction });
        }

        for (const msg of contents) {
            // Map Gemini roles to Mistral roles
            const role = msg.role === "model" ? "assistant" : "user";

            let contentStr = "";

            // Check if there's a function response in the user part
            const functionResponsePart = msg.parts.find((p: any) => p.functionResponse);
            if (functionResponsePart) {
                const fr = (functionResponsePart as any).functionResponse;
                let resStr = typeof fr.response === 'string' ? fr.response : JSON.stringify(fr.response);
                contentStr = `[Function Result for ${fr.name}]: ${resStr}`;
            } else {
                contentStr = msg.parts
                    .filter((p: any) => typeof p.text === 'string')
                    .map((p: any) => p.text)
                    .join(' ');
            }

            const functionCallPart = msg.parts.find((p: any) => p.functionCall);
            let tool_calls = undefined;
            if (functionCallPart) {
                const fc = (functionCallPart as any).functionCall;
                if (fc) {
                    tool_calls = [{
                        id: crypto.randomUUID(),
                        type: "function",
                        function: {
                            name: fc.name,
                            arguments: JSON.stringify(fc.args)
                        }
                    }];
                }
            }

            if (contentStr || tool_calls) {
                const outMsg: any = { role };
                if (contentStr) outMsg.content = contentStr;
                if (tool_calls) outMsg.tool_calls = tool_calls;
                messages.push(outMsg);
            }
        }

        return messages;
    }

    /**
     * Translates Gemini Tool declarations into Mistral/OpenAI Tool schemas
     */
    private translateTools(geminiTools?: any[]): any[] | undefined {
        if (!geminiTools || !geminiTools.length) return undefined;
        const mistralTools: any[] = [];
        for (const t of geminiTools) {
            if (t.functionDeclarations) {
                for (const fd of t.functionDeclarations) {
                    mistralTools.push({
                        type: "function",
                        function: {
                            name: fd.name,
                            description: fd.description,
                            parameters: fd.parameters
                        }
                    });
                }
            }
        }
        return mistralTools.length ? mistralTools : undefined;
    }

    /**
     * Generate content using Mistral model (Non-Streaming)
     */
    async generateContent(
        contents: GeminiContent[],
        systemInstruction?: string,
        config: any = {}
    ): Promise<LlmResponse> {
        const model = config.model || "mistral-medium-latest";
        const messages = this.translateContents(contents, systemInstruction);
        const tools = this.translateTools(config.tools);

        const requestBody: any = {
            messages,
            model,
            stream: false,
            temperature: config.temperature ?? 0.7,
            max_tokens: config.maxOutputTokens || 8000
        };

        if (config.topP !== undefined) requestBody.top_p = config.topP;
        if (config.presencePenalty !== undefined) requestBody.presence_penalty = config.presencePenalty;
        if (config.frequencyPenalty !== undefined) requestBody.frequency_penalty = config.frequencyPenalty;
        if (tools) requestBody.tools = tools;
        if (config.toolConfig?.functionCallingConfig?.mode === "AUTO") {
            requestBody.tool_choice = "auto";
        }

        const requestId = crypto.randomUUID().slice(0, 8);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        try {
            console.log(`[MistralService][${model}] Requesting...`);

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            };

            const response = await fetch(this.baseUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => "Unknown error");
                console.error(`[MistralService][${requestId}] API Error: ${response.status}`, errorText);

                const error = new Error(`Mistral API failed: ${response.status} ${errorText}`);
                (error as any).status = response.status;
                (error as any).reason = errorText;
                throw error;
            }

            const data = await response.json();
            const message = data?.choices?.[0]?.message;
            const content = message?.content || "";
            let functionCall = undefined;
            let functionCallParts = undefined;

            if (message?.tool_calls?.length > 0) {
                const tc = message.tool_calls[0];
                try {
                    functionCall = {
                        name: tc.function.name,
                        args: JSON.parse(tc.function.arguments || "{}")
                    };
                    functionCallParts = [{ functionCall }];
                } catch (e) {
                    console.error("[MistralService] Failed to parse tool args", e);
                }
            }

            if (!content && !functionCall) {
                throw new Error("No content or tool call returned from Mistral");
            }

            return {
                text: content,
                functionCall,
                functionCallParts,
                usage: {
                    total_tokens: data.usage?.total_tokens || 0,
                    prompt_tokens: data.usage?.prompt_tokens || 0,
                    candidates_tokens: data.usage?.completion_tokens || 0,
                },
                raw: data
            };
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    /**
     * Stream generateContent: yields text chunks via onChunk.
     */
    async streamGenerateContent(
        contents: GeminiContent[],
        systemInstruction?: string,
        config: any = {},
        onChunk: (text: string) => void | Promise<void> = () => { },
        options?: { signal?: AbortSignal }
    ): Promise<LlmResponse> {
        const model = config.model || "mistral-medium-latest";
        const messages = this.translateContents(contents, systemInstruction);
        const tools = this.translateTools(config.tools);

        const requestBody: any = {
            messages,
            model,
            stream: true,
            temperature: config.temperature ?? 0.7,
            max_tokens: config.maxOutputTokens || 8000
        };

        if (config.topP !== undefined) requestBody.top_p = config.topP;
        if (config.presencePenalty !== undefined) requestBody.presence_penalty = config.presencePenalty;
        if (config.frequencyPenalty !== undefined) requestBody.frequency_penalty = config.frequencyPenalty;
        if (tools) requestBody.tools = tools;
        if (config.toolConfig?.functionCallingConfig?.mode === "AUTO") {
            requestBody.tool_choice = "auto";
        }

        const controller = new AbortController();
        if (options?.signal) {
            options.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        try {
            console.log(`[MistralService][${model}] Streaming Request...`);

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            };

            const response = await fetch(this.baseUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "Unknown error");
                console.error(`[MistralService] Stream API Error: ${response.status}`, errorText);
                throw new Error(`Mistral API failed: ${response.status} ${errorText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body for stream");

            const decoder = new TextDecoder();
            let fullText = "";
            let functionCallName = "";
            let functionCallArgs = "";
            let fullUsage = { total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 };

            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") continue;
                    if (trimmed.startsWith("data:")) {
                        const jsonStr = trimmed.slice(5).trim();
                        if (!jsonStr) continue;
                        try {
                            const data = JSON.parse(jsonStr);
                            const delta = data.choices?.[0]?.delta;

                            if (data.usage) {
                                fullUsage = {
                                    total_tokens: data.usage.total_tokens || 0,
                                    prompt_tokens: data.usage.prompt_tokens || 0,
                                    candidates_tokens: data.usage.completion_tokens || 0,
                                };
                            }

                            if (!delta) continue;

                            if (delta.content) {
                                fullText += delta.content;
                                await Promise.resolve(onChunk(delta.content));
                            }

                            if (delta.tool_calls?.[0]) {
                                const tc = delta.tool_calls[0];
                                if (tc.function?.name) functionCallName += tc.function.name;
                                if (tc.function?.arguments) functionCallArgs += tc.function.arguments;
                            }
                        } catch (e) {
                            // ignore malformed JSON chunk
                        }
                    }
                }
            }

            let functionCall = undefined;
            if (functionCallName) {
                try {
                    functionCall = {
                        name: functionCallName,
                        args: JSON.parse(functionCallArgs || "{}")
                    };
                } catch (e) {
                    console.error("[MistralService] Failed to parse streaming tool args", e);
                }
            }

            return {
                text: fullText,
                functionCall,
                functionCallParts: functionCall ? [{ functionCall }] : undefined,
                usage: fullUsage
            };
        } catch (err) {
            throw err;
        }
    }
}
