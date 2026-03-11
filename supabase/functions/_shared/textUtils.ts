// supabase/functions/_shared/textUtils.ts

/**
 * Sanitizes plain text by removing markdown formatting, images, and extra whitespace.
 * Used before TTS: only strips # and * so we don't over-strip and drop sentences
 * (e.g. "key_point" or list lines). TTS still gets natural speech; we can't tell
 * TTS to "ignore" characters, we must send clean text.
 */
export function sanitizePlainText(input: string): string {
    return (typeof input === "string" ? input : "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[[^\]]+\]\([^)]+\)/g, "")
        .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
        .replace(/[#*]+/g, "")
        .replace(/-{3,}/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Generates a stable hash for a string based on the FNV-1a algorithm.
 */
export function hashString(data: string): string {
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) {
        h ^= data.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
}

/**
 * Masks a sensitive key for logging.
 */
export function maskKey(key = ""): string {
    if (!key || key.length <= 8) return "****";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
