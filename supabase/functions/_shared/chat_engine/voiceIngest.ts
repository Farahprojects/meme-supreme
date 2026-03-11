import { sanitizePlainText } from "../textUtils.ts";
import { flushVoiceBuffer } from "../voiceBufferUtils.ts";

export class VoiceIngestClient {
    private voiceBuffer: string = "";
    private seq: number = 0;
    private postChain: Promise<void> = Promise.resolve();
    private vpsUrl: string;
    private vpsSecret: string;

    constructor(
        private voiceSessionId: string,
        private effectiveTurnId: string,
        private voiceName: string
    ) {
        const VPS_WORKERS_URL = Deno.env.get("VPS_WORKERS_URL");
        const VPS_SECRET = Deno.env.get("VPS_SECRET");
        if (!VPS_WORKERS_URL || !VPS_SECRET) {
            throw new Error("VPS not configured for voice mode (VPS_WORKERS_URL, VPS_SECRET)");
        }
        this.vpsUrl = VPS_WORKERS_URL;
        this.vpsSecret = VPS_SECRET;
    }

    private sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    private async postToVPS(chunkSeq: number, textChunk: string, isFinal: boolean): Promise<void> {
        const payload = {
            voice_session_id: this.voiceSessionId,
            turnId: this.effectiveTurnId,
            textChunk,
            seq: chunkSeq,
            isFinal,
            voice: this.voiceName,
        };

        const maxAttempts = 3;
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetch(`${this.vpsUrl}/voice/ingest-text`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-vps-secret": this.vpsSecret,
                    },
                    body: JSON.stringify(payload),
                });

                if (response.ok) return;

                const responseBody = await response.text().catch(() => "");
                const err = new Error(`VPS ${response.status} on seq=${chunkSeq} final=${isFinal}: ${responseBody}`);
                lastError = err;

                if (response.status >= 400 && response.status < 500) throw err;
            } catch (e) {
                lastError = e;
            }

            if (attempt < maxAttempts) await this.sleep(120 * attempt);
        }

        throw lastError instanceof Error ? lastError : new Error(`Failed posting to VPS for seq=${chunkSeq}`);
    }

    public async enqueuePost(textChunk: string, isFinal: boolean): Promise<void> {
        const chunkSeq = this.seq++;
        this.postChain = this.postChain
            .then(() => this.postToVPS(chunkSeq, textChunk, isFinal))
            .catch((e) => console.error("[VoiceIngestClient] VPS ingest error:", e));
        return this.postChain;
    }

    public streamOnChunk = (chunk: string) => {
        this.voiceBuffer += chunk;
        const flushed = flushVoiceBuffer(this.voiceBuffer);
        this.voiceBuffer = flushed.remaining;
        if (flushed.sentences.length > 0) {
            const batch = flushed.sentences.map((s) => sanitizePlainText(s)).filter(Boolean);
            batch.forEach((t) => {
                void this.enqueuePost(t, false);
            });
        }
    };

    public async finalize(assistantText: string): Promise<void> {
        const trimmed = sanitizePlainText(this.voiceBuffer);
        await this.enqueuePost(trimmed || "", true);
        await this.postChain;
    }
}
