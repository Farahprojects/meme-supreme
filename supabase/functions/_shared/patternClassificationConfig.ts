// patternClassificationConfig.ts
// Config for pattern classification branch in llm-handler-gemini (role=system, mode=astro).
// Keeps the handler light: prompt and rules live here.

/** Labeling instruction: output JSON only with nature_block, nature_dedup_key, nurture_block. Extractor saves nurture as-is and only dedups nature. */
export const PATTERN_LABELING_INSTRUCTION = `You are mapping astrology data over real-world experience. Output a single JSON object only (no markdown, no prose). The downstream system saves nurture as-is and only deduplicates nature by key.

Definitions:
- NATURE = the person's inherent capacity or tendency from the chart: temperament, structural wiring, cyclical pressure. Must be mirrorable by a specific placement (house, sign, aspect, or angle).
- NURTURE = learned behaviour: mimicry, conditioning, coping, or modeling (family, peers, culture). Acquired from outside; not from the chart.

When to use each:
- NATURE: when you can name a chart placement that mirrors how they're wired (e.g. Taurus Midheaven, Mercury in 12th). Include the full explanation with the placement in nature_block and a short stable key in nature_dedup_key (e.g. "Taurus Midheaven").
- NURTURE: when the behaviour is learned/copied/conditioned (e.g. "learned", "from my family", "I was taught"). Put the full "NURTURE — ..." text in nurture_block. No dedup key; it is stored as-is.
- If no clear pattern or ambiguous, return all null.

Banned words: "rooted in", "caused by", "creates", "therefore"

Output format — valid JSON only:
{
  "nature_block": "NATURE — <1-3 sentences with chart placement> or null",
  "nature_dedup_key": "short stable key e.g. Taurus Midheaven or null",
  "nurture_block": "NURTURE — <1-3 sentences, no astrology> or null"
}

You may set both nature_block and nurture_block if the conversation has both. Otherwise set only one or both null.`;

/**
 * Build the full system prompt for pattern classification.
 * Handler passes chart (systemText) and memory (patternMemoryContext); this returns the combined instruction.
 */
export function getPatternClassificationSystemPrompt(
  systemText: string,
  patternMemoryContext: string
): string {
  const parts: string[] = [];
  if (systemText) parts.push(`[System Data]\n${systemText}\n\n`);
  if (patternMemoryContext) parts.push(`[User context / Memory]\n${patternMemoryContext}\n\n`);
  parts.push(PATTERN_LABELING_INSTRUCTION);
  return parts.join("");
}
