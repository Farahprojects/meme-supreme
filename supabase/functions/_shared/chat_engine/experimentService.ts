import type { SupabaseClient } from "../types.ts";
import type { LlmResponse } from "../llmService.ts";
import { optimizeSwissData } from "../astroContextService.ts";

export const RESONANCE_MODEL = "gemini-3-flash-preview";

export function getABResponseParams(baseOpts: Record<string, unknown>, variant: 'A' | 'B', experimentConfig: Record<string, unknown> | null) {
    const config = experimentConfig?.ab_response_llm_config as Record<string, unknown> || {};
    const { tools, toolConfig, ...safeOpts } = baseOpts as any;

    if (variant === 'A') {
        return {
            ...safeOpts,
            temperature: (config as any).temperature_a ?? safeOpts.temperature,
            model: (config as any).model_a ?? safeOpts.model,
        };
    } else {
        return {
            ...safeOpts,
            temperature: (config as any).temperature_b ?? safeOpts.temperature,
            model: (config as any).model_b ?? safeOpts.model,
        };
    }
}

export function getResonanceParams(baseOpts: Record<string, unknown>, variant: 'A' | 'B', experimentConfig: Record<string, unknown> | null) {
    const config = experimentConfig?.resonance_llm_config as Record<string, unknown> || {};
    const { tools, toolConfig, ...safeOpts } = baseOpts as any;

    const temperatureA = (config as any).temperature_a ?? safeOpts.temperature;
    const temperatureB = (config as any).temperature_b ?? safeOpts.temperature;

    if (variant === 'A') {
        return { ...safeOpts, model: RESONANCE_MODEL, temperature: temperatureA };
    } else {
        return { ...safeOpts, model: RESONANCE_MODEL, temperature: temperatureB };
    }
}

export async function storeExperimentMessage(
    supabase: SupabaseClient,
    chatId: string,
    content: string,
    variant?: 'A' | 'B'
): Promise<string> {
    const { data: message, error } = await supabase
        .from("messages")
        .insert({ chat_id: chatId, text: content, role: "assistant", status: "complete", variant })
        .select("id")
        .single();

    if (error) throw new Error(error.message);
    return message?.id || "";
}

export async function fetchPlaceboAstroData(requestId: string): Promise<any> {
    const placeboUrl = "https://wrvqqvqvwqmfdqvqmaar.supabase.co/storage/v1/object/sign/swiss_data/Placebo%20/1771734201140_21c6828d-976c-4d59-88e5-d2cdccacc75f.json?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iZGRiOWYyNi05NzNmLTRkZGEtYTM0Mi03YjNjZGQ2NDE5OWEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzd2lzc19kYXRhL1BsYWNlYm8gLzE3NzE3MzQyMDExNDBfMjFjNjgyOGQtOTc2Yy00ZDU5LTg4ZTUtZDJjZGNjYWNjNzVmLmpzb24iLCJpYXQiOjE3NzE3MzQzODcsImV4cCI6MjYzNTczNDM4N30.aw7ylL5QzHGeGv72ii1tEItF7V6idaf8_9yeeAn3Ze4";
    try {
        const res = await fetch(placeboUrl);
        if (res.ok) return await res.json();
        console.error(`[RESONANCE TEST][${requestId}] Failed to fetch hardcoded Placebo URL, status: ${res.status}`);
    } catch (err) {
        console.error(`[RESONANCE TEST][${requestId}] Error fetching hardcoded Placebo URL:`, err);
    }
    return null;
}
