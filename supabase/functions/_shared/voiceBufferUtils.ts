/**
 * Voice buffer utilities for TTS streaming.
 * Flushes sentences from a buffer for posting to VPS voice-ingest.
 */

/** Flush one or more sentences from the front of the buffer for TTS. Returns sentences to speak and the remaining buffer. */
export function flushVoiceBuffer(buffer: string): { sentences: string[]; remaining: string } {
  const trimmed = buffer.trim();
  if (!trimmed) return { sentences: [], remaining: "" };
  const sentences: string[] = [];
  let rest = trimmed;
  while (rest.length > 0) {
    const match = rest.match(/^([^.!?]*[.!?])\s*/);
    if (match) {
      sentences.push(match[1].trim());
      rest = rest.slice(match[0].length).trim();
      continue;
    }
    // Secondary break at comma/colon/semicolon when buffer exceeds ~60 chars (avoids dead zone 40–100 with no natural break)
    if (rest.length >= 60) {
      const matchComma = rest.match(/^(.{20,}?[,;:])\s*/);
      if (matchComma) {
        sentences.push(matchComma[1].trim());
        rest = rest.slice(matchComma[0].length).trim();
        continue;
      }
    }
    // Eager first chunk: flush at ~40 chars so "speaking" and first audio start much sooner (reduces 15s gap before first Posting to VPS)
    if (rest.length >= 40) {
      const lastSpace = rest.lastIndexOf(" ", 60);
      const cut = lastSpace > 20 ? rest.slice(0, lastSpace + 1) : rest.slice(0, 50);
      sentences.push(cut.trim());
      rest = rest.slice(cut.length).trim();
      continue;
    }
    // Larger chunks for the rest of the turn
    if (rest.length >= 100) {
      const lastSpace = rest.lastIndexOf(" ", 120);
      const cut = lastSpace > 50 ? rest.slice(0, lastSpace + 1) : rest.slice(0, 100);
      sentences.push(cut.trim());
      rest = rest.slice(cut.length).trim();
      continue;
    }
    break;
  }
  return { sentences, remaining: rest };
}
