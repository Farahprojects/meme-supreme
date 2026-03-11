import type { SupabaseClient } from "./types.ts";
import { STARTER_PROMPTS } from "./starterPrompts.ts";

export function resolveStarterPrompt(
    _supabase: SupabaseClient,
    starterKey: string
): Promise<string | null> {
    const prompt = STARTER_PROMPTS[starterKey];

    if (!prompt) {
        console.log(`[starterPromptResolver] Unknown key: ${starterKey} (no mapping in STARTER_PROMPTS)`);
        return Promise.resolve(null);
    }

    return Promise.resolve(prompt);
}
