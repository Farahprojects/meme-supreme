// TTS Worker - In-process synthesis + broadcast for voice path
// Used by llm-handler-gemini to remove the HTTP hop to google-text-to-speech.
// Uses the same env as the TTS edge function: GOOGLE-TTS-NEW (one key, shared by both).

import { logCostEvent } from "./costLogger.ts";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ITEMS = 100;
const MAX_CHUNK_CHARS = 500;

type CacheEntry = { base64: string; expires: number };
const cache = new Map<string, CacheEntry>();

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  let isFirstChunk = true;

  while (remaining.length > 0) {
    const currentMax = isFirstChunk ? 150 : MAX_CHUNK_CHARS;
    const searchWindow = remaining.substring(0, currentMax);
    let breakPoint = -1;

    if (remaining.length <= currentMax) {
      breakPoint = remaining.length;
    } else {
      const puncts = [". ", "! ", "? "];
      if (isFirstChunk) {
        let minIdx = -1;
        for (const punct of puncts) {
          const idx = searchWindow.indexOf(punct);
          if (idx !== -1 && (minIdx === -1 || idx < minIdx)) minIdx = idx + punct.length;
        }
        if (minIdx !== -1) breakPoint = minIdx;
      } else {
        for (const punct of [". ", "! ", "? ", ", ", "; ", ": "]) {
          const idx = searchWindow.lastIndexOf(punct);
          if (idx > currentMax * 0.3) {
            breakPoint = idx + punct.length;
            break;
          }
        }
      }
      if (breakPoint === -1) {
        breakPoint = searchWindow.lastIndexOf(" ");
        if (breakPoint === -1) breakPoint = currentMax;
      }
    }

    const chunk = remaining.substring(0, breakPoint).trim();
    if (chunk) {
      chunks.push(chunk);
      isFirstChunk = false;
    }
    remaining = remaining.substring(breakPoint).trim();
  }
  return chunks;
}

function cacheKey(text: string, voiceName: string): string {
  return `${voiceName}::${text}`;
}

function getFromCache(key: string): string | undefined {
  const entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) {
    if (entry) cache.delete(key);
    return undefined;
  }
  return entry.base64;
}

function setCache(key: string, base64: string): void {
  cache.set(key, { base64, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX_ITEMS) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (let i = 0; i < oldest.length - CACHE_MAX_ITEMS; i++) cache.delete(oldest[i][0]);
  }
}

async function synthesizeMP3(
  apiKey: string,
  text: string,
  voiceName: string,
  signal?: AbortSignal
): Promise<string> {
  const resp = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "en-US", name: voiceName },
        audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000 },
      }),
      ...(signal !== undefined && { signal }),
    }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Google TTS API error (${resp.status}): ${errText}`);
  }
  const json = await resp.json();
  if (!json?.audioContent) throw new Error("Google TTS API returned no audioContent");
  return json.audioContent as string;
}

export interface RunTTSWorkerParams {
  text: string;
  voice: string;
  chat_id: string;
  user_id: string | undefined;
}

export interface BroadcastOneChunkParams {
  text: string;
  voice: string;
  chat_id: string;
  user_id: string | undefined;
  chunkIndex: number;
  totalChunks?: number;
  isLastChunk: boolean;
}

/** Payload shape for voice-tts-ready (so we can synthesize in parallel then broadcast in order). */
export interface VoiceTTSReadyPayload {
  audioBytes: number[];
  text: string;
  chat_id: string;
  mimeType: string;
  chunkIndex: number;
  totalChunks?: number | undefined;
  isLastChunk: boolean;
}

/**
 * Synthesize one piece of text and return the voice-tts-ready payload (no broadcast).
 * Used for parallel TTS: synthesize multiple sentences at once, then broadcast in order.
 */
export async function synthesizeOneChunkPayload(params: BroadcastOneChunkParams): Promise<VoiceTTSReadyPayload | null> {
  const { text, voice, chat_id, user_id, chunkIndex, totalChunks, isLastChunk } = params;
  const apiKey = Deno.env.get("GOOGLE-TTS-NEW");
  if (!apiKey || !user_id || !text.trim()) return null;

  const voiceName = `en-US-Chirp3-HD-${voice}`;
  const key = cacheKey(text.trim(), voiceName);
  let audioBase64 = getFromCache(key);
  if (!audioBase64) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      audioBase64 = await synthesizeMP3(apiKey, text.trim(), voiceName, controller.signal);
      setCache(key, audioBase64);
    } catch (e) {
      console.error("[ttsWorker] Stream chunk synthesis error:", e);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  const binaryString = atob(audioBase64);
  const audioBytes = new Uint8Array(binaryString.length);
  for (let j = 0; j < binaryString.length; j++) audioBytes[j] = binaryString.charCodeAt(j);

  return {
    audioBytes: Array.from(audioBytes),
    text: text.trim(),
    chat_id,
    mimeType: "audio/mpeg",
    chunkIndex,
    totalChunks: totalChunks ?? (isLastChunk ? chunkIndex + 1 : undefined),
    isLastChunk,
  };
}

/**
 * Broadcast a pre-built voice-tts-ready payload (used after parallel synthesis).
 */
export async function broadcastVoiceTTSReady(supabase: { channel: (name: string) => { send: (msg: unknown) => Promise<unknown>; unsubscribe: () => void } }, user_id: string, payload: VoiceTTSReadyPayload): Promise<void> {
  const channel = supabase.channel(`user-realtime:${user_id}`);
  try {
    await channel.send({ type: "broadcast", event: "voice-tts-ready", payload }, { httpSend: true });
  } finally {
    channel.unsubscribe();
  }
}

/**
 * Synthesize one piece of text and broadcast voice-tts-ready immediately.
 * Used when streaming LLM: pipe sentence-by-sentence so audio can start before full reply.
 */
export async function synthesizeAndBroadcastOneChunk(
  supabase: any,
  params: BroadcastOneChunkParams
): Promise<void> {
  const payload = await synthesizeOneChunkPayload(params);
  if (payload && params.user_id) await broadcastVoiceTTSReady(supabase, params.user_id, payload);
}

/**
 * Run TTS in-process: split text, synthesize chunks (MP3), broadcast voice-tts-ready in order.
 * Uses context.supabase for broadcast; no HTTP call to google-text-to-speech.
 * Uses same env as google-text-to-speech: GOOGLE-TTS-NEW (set once at project or on both functions).
 */
export async function runTTSWorker(supabase: any, params: RunTTSWorkerParams): Promise<void> {
  const { text, voice, chat_id, user_id } = params;
  const apiKey = Deno.env.get("GOOGLE-TTS-NEW");
  if (!apiKey) {
    console.error("[ttsWorker] Missing env GOOGLE-TTS-NEW, skipping TTS");
    return;
  }
  if (!user_id) {
    console.warn("[ttsWorker] No user_id provided, skipping broadcast");
    return;
  }

  const voiceName = `en-US-Chirp3-HD-${voice}`;
  const chunks = splitIntoChunks(text);
  const totalChunks = chunks.length;

  const channel = supabase.channel(`user-realtime:${user_id}`);
  const chunkPromises: Promise<{ index: number; audioBytes: Uint8Array } | null>[] = new Array(totalChunks);
  const CONCURRENCY = 3;
  let nextChunkIdx = 0;

  const processChunk = async (idx: number): Promise<{ index: number; audioBytes: Uint8Array } | null> => {
    const chunk = chunks[idx];
    const key = cacheKey(chunk, voiceName);
    let audioBase64 = getFromCache(key);
    if (!audioBase64) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        audioBase64 = await synthesizeMP3(apiKey, chunk, voiceName, controller.signal);
        setCache(key, audioBase64);
      } catch (e) {
        console.error("[ttsWorker] Chunk %s synthesis error:", idx, e);
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }
    const binaryString = atob(audioBase64!);
    const audioBytes = new Uint8Array(binaryString.length);
    for (let j = 0; j < binaryString.length; j++) audioBytes[j] = binaryString.charCodeAt(j);
    return { index: idx, audioBytes };
  };

  const startNext = (): void => {
    if (nextChunkIdx >= totalChunks) return;
    const idx = nextChunkIdx++;
    chunkPromises[idx] = processChunk(idx).then((res) => {
      startNext();
      return res;
    });
  };

  for (let i = 0; i < CONCURRENCY && i < totalChunks; i++) startNext();

  try {
    for (let i = 0; i < totalChunks; i++) {
      while (!chunkPromises[i]) await new Promise((r) => setTimeout(r, 10));
      const result = await chunkPromises[i];
      if (!result) {
        console.warn("[ttsWorker] Skipping failed chunk %s", i);
        continue;
      }
      await channel.send(
        {
          type: "broadcast",
          event: "voice-tts-ready",
          payload: {
            audioBytes: Array.from(result.audioBytes),
            text: chunks[result.index],
            chat_id,
            mimeType: "audio/mpeg",
            chunkIndex: result.index,
            totalChunks,
            isLastChunk: result.index === totalChunks - 1,
          },
        },
        { httpSend: true }
      );
      if (result.index < totalChunks - 1) await new Promise((r) => setTimeout(r, 20));
    }
    if (text.length > 0) {
      logCostEvent(supabase, {
        source: "tts",
        modality: "audio",
        model: "google-tts",
        input_units: text.length,
        output_units: 0,
        user_id,
        chat_id,
      }).catch((e) => console.error("[ttsWorker] Cost log failed:", e));
    }
  } catch (e) {
    console.error("[ttsWorker] Broadcast error:", e);
  } finally {
    channel.unsubscribe();
  }
}
