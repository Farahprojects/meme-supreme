/**
 * Voice token service - generates and validates HMAC-based voice tokens
 * Used by chat-send to issue tokens for VPS voice WebSocket auth
 */

const VOICE_TOKEN_SECRET = Deno.env.get("VOICE_TOKEN_SECRET") || "voice_token_secret_change_in_production";
const TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export interface VoiceTokenPayload {
  user_id: string;
  exp: number; // expiry timestamp (ms)
}

/**
 * Generate a voice token (HMAC-signed)
 * Format: base64(payload).base64(hmac)
 */
export async function generateVoiceToken(user_id: string): Promise<string> {
  const payload: VoiceTokenPayload = {
    user_id,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = btoa(payloadJson);

  // Generate HMAC
  const encoder = new TextEncoder();
  const keyData = encoder.encode(VOICE_TOKEN_SECRET);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const dataToSign = encoder.encode(payloadB64);
  const signature = await crypto.subtle.sign("HMAC", key, dataToSign);
  const hmacB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return `${payloadB64}.${hmacB64}`;
}

/**
 * Generate a voice_session_id (UUID)
 */
export function generateVoiceSessionId(): string {
  return crypto.randomUUID();
}
