// supabase/functions/_shared/deepThinking.ts
// Shared logic for iterative deep thinking / chain-of-thought reasoning

import { GeminiService, ThoughtStep } from "./llmService.ts";

const llmService = new GeminiService();
const MAX_THINK_ITERATIONS = 5;

/**
 * Broadcast deep thinking status to client via WebSocket
 */
export async function broadcastDeepThinking(
    supabase: any,
    user_id: string,
    chat_id: string,
    status: 'started' | 'thinking' | 'complete',
    iteration: number,
    maxIterations: number,
    statusMessage?: string
) {
    try {
        const channel = supabase.channel(`user-realtime:${user_id}`);
        await channel.send(
            { type: 'broadcast', event: 'deep-thinking', payload: { type: 'deep-thinking', chat_id, status, iteration, maxIterations, statusMessage: statusMessage || null } },
            { httpSend: true }
        );
        console.log(`[DeepThink] Broadcast: ${status}, iteration ${iteration}/${maxIterations}${statusMessage ? `, msg: "${statusMessage}"` : ''}`);
    } catch (e) {
        console.warn('[DeepThink] Failed to broadcast status:', e);
    }
}

/**
 * Execute deep thinking loop for complex questions
 */
export async function executeDeepThinking(
    supabase: any,
    chat_id: string,
    user_id: string,
    userQuestion: string,
    systemContext: string
): Promise<{ answer: string; usage: { prompt_tokens: number; candidates_tokens: number; total_tokens: number }; iterations: number }> {
    const chain_id = crypto.randomUUID();
    const thoughts: ThoughtStep[] = [];
    const usage = { prompt_tokens: 0, candidates_tokens: 0, total_tokens: 0 };
    let iteration = 0;
    let finalAnswer = "";

    console.log(`[DeepThink] Starting chain ${chain_id} for: "${userQuestion.slice(0, 50)}..."`);

    // Broadcast start with initial status message
    await broadcastDeepThinking(supabase, user_id, chat_id, 'started', 0, MAX_THINK_ITERATIONS, 'Analyzing your question...');

    while (iteration < MAX_THINK_ITERATIONS) {
        iteration++;

        // Get the next_step from previous iteration to show what we're doing now
        const currentStatusMessage = thoughts.length > 0
            ? thoughts[thoughts.length - 1].next_step
            : 'Thinking through this...';

        // Broadcast current iteration with natural language status
        await broadcastDeepThinking(supabase, user_id, chat_id, 'thinking', iteration, MAX_THINK_ITERATIONS, currentStatusMessage || 'Thinking through this...');

        try {
            const result = await llmService.deepThink(userQuestion, thoughts, systemContext);
            usage.total_tokens += result.usage.total_tokens;
            usage.prompt_tokens += result.usage.prompt_tokens;
            usage.candidates_tokens += result.usage.candidates_tokens;

            // Store thought in database
            await supabase.from("thought_chains").insert({
                chat_id,
                user_id,
                chain_id,
                iteration,
                goal: result.thought.goal,
                reasoning: result.thought.reasoning,
                next_step: result.thought.next_step,
                confidence: result.thought.confidence,
                status: result.isComplete ? "complete" : "thinking",
                final_answer: result.thought.final_answer,
                token_usage: result.usage
            });

            thoughts.push(result.thought);

            console.log(`[DeepThink] Iteration ${iteration}: confidence=${result.thought.confidence}%, complete=${result.isComplete}`);

            if (result.isComplete) {
                finalAnswer = result.thought.final_answer || "";

                // Mark the chain as answered
                await supabase.from("thought_chains")
                    .update({ status: "answered" })
                    .eq("chain_id", chain_id);

                break;
            }
        } catch (e) {
            console.error(`[DeepThink] Error in iteration ${iteration}:`, e);
            // If we have any thoughts, try to use the last one's reasoning as fallback
            if (thoughts.length > 0) {
                const lastThought = thoughts[thoughts.length - 1];
                finalAnswer = lastThought.final_answer || `Based on my analysis: ${lastThought.reasoning}`;
            }
            break;
        }
    }

    // If we hit max iterations without a final answer, synthesize one
    if (!finalAnswer && thoughts.length > 0) {
        const lastThought = thoughts[thoughts.length - 1];
        finalAnswer = lastThought.final_answer || lastThought.reasoning;
        console.log(`[DeepThink] Max iterations reached, using last thought as answer`);
    }

    // Broadcast completion
    await broadcastDeepThinking(supabase, user_id, chat_id, 'complete', iteration, MAX_THINK_ITERATIONS, 'Done thinking');

    console.log(`[DeepThink] Completed: ${iteration} iterations, ${usage.total_tokens} tokens`);

    return { answer: finalAnswer, usage, iterations: iteration };
}
