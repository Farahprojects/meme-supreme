// llmModeConfig.ts
// Per-mode configuration for llm-handler-gemini: prompt, cache, memory.
// Handler becomes a router: resolve mode → config → use config for instruction, cache, memory.

import { SYSTEM_PROMPT } from "./aiConfig.ts";

// Helper function to get full language name from ISO code
function getLanguageName(languageCode: string): string {
  const languageNames: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
  };
  return languageNames[languageCode] || 'English';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EffectiveMode = "chat" | "starter" | string;

export interface InstructionParams {
  dateContext: string;
  systemText: string;
  systemOverlay?: string | undefined;
  memoryContext?: string | undefined;
  language?: string | undefined;
}

export interface ModeConfig {
  /** Use Gemini context cache (system prompt + system data). */
  useCache: boolean;
  /** Inject STM + pinned LTM into system instruction. */
  useMemory: boolean;
  /** Build the full system instruction for this mode. */
  getSystemInstruction: (params: InstructionParams) => string;
  /** Prompt used when creating cache (must match getSystemInstruction for cache to be valid). Only used when useCache is true. */
  systemPromptForCache?: string;
}

// ---------------------------------------------------------------------------
// Shared builder (used by chat mode)
// ---------------------------------------------------------------------------

function buildFullSystemInstruction(params: {
  systemPrompt: string;
  dateContext: string;
  systemText: string;
  systemOverlay?: string | undefined;
  memoryContext?: string | undefined;
  language?: string | undefined;
}): string {
  const { systemPrompt, dateContext, systemText, systemOverlay, memoryContext, language } = params;

  if (!systemText) {
    return `${systemPrompt}\n\n${dateContext}${systemOverlay ? `\n\n[Additional Context]\n${systemOverlay}` : ""}`;
  }

  return [
    systemPrompt,
    language && language !== 'en' ? `## Language\nRespond to the user in ${getLanguageName(language)}. Use natural, conversational language appropriate for this culture and region.` : "",
    dateContext,
    `[System Data]\n${systemText}`,
    systemOverlay ? `[Additional Context]\n${systemOverlay}` : "",
    memoryContext ? `<user_memory>\n${memoryContext}\n</user_memory>` : "",
    `[CRITICAL: Remember Your Instructions]\n${systemPrompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Mode-specific prompts (starter: short, no jargon)
// ---------------------------------------------------------------------------

const STARTER_SYSTEM_INSTRUCTION = `You are Therai, owned by Therai. Never use any other name for yourself.

Based on the astro data, answer the user.

- Translate to plain language only.
- No astro jargon, metaphors, stories, or planetary talk.
- Never mention data unless asked.
- Integrate insights naturally.`;

// ---------------------------------------------------------------------------
// Test: full chat instructions for starter (set STARTER_USE_FULL_INSTRUCTIONS=true to compare)
// ---------------------------------------------------------------------------

function useFullInstructionsForStarter(): boolean {
  try {
    return Deno.env.get("STARTER_USE_FULL_INSTRUCTIONS") === "true";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mode configs
// ---------------------------------------------------------------------------

const MODE_CONFIGS: Record<string, ModeConfig> = {
  chat: {
    useCache: true,
    useMemory: true,
    systemPromptForCache: SYSTEM_PROMPT,
    getSystemInstruction: (p) =>
      buildFullSystemInstruction({
        systemPrompt: SYSTEM_PROMPT,
        dateContext: p.dateContext,
        systemText: p.systemText,
        systemOverlay: p.systemOverlay,
        memoryContext: p.memoryContext,
      }),
  },

  starter: {
    useCache: false,
    useMemory: false,
    getSystemInstruction: (p) => {
      if (useFullInstructionsForStarter()) {
        return buildFullSystemInstruction({
          systemPrompt: SYSTEM_PROMPT,
          dateContext: p.dateContext,
          systemText: p.systemText,
          systemOverlay: p.systemOverlay,
          memoryContext: undefined,
          language: p.language,
        });
      }
      return [p.dateContext, p.systemText ? `[System Data]\n${p.systemText}` : "", STARTER_SYSTEM_INSTRUCTION]
        .filter(Boolean)
        .join("\n\n");
    },
  },

  signal_lab: {
    useCache: false,
    useMemory: false,
    getSystemInstruction: () => "",
  },
};

// ---------------------------------------------------------------------------
// Resolve effective mode and get config
// ---------------------------------------------------------------------------

/**
 * Resolve which mode config to use. role=starter → "starter"; else use request mode (e.g. "chat", "swiss").
 */
export function resolveEffectiveMode(role: string | undefined, mode: string | undefined): EffectiveMode {
  if (role === "starter") return "starter";
  return mode ?? "chat";
}

const DEFAULT_CONFIG: ModeConfig = MODE_CONFIGS["chat"]!;

/**
 * Get config for the given effective mode. Unknown modes fall back to chat config.
 */
export function getModeConfig(effectiveMode: EffectiveMode): ModeConfig {
  return MODE_CONFIGS[effectiveMode] ?? DEFAULT_CONFIG;
}
