import type { SupabaseClient } from "./types.ts";

/**
 * Fetches and parses Swiss data from Supabase Storage using the provided URL/path.
 *
 * @param supabase Supabase client instance
 * @param storagePath Path in the 'swiss_data' bucket (e.g. "user_id/timestamp.json")
 * @returns Parsed JSON or null if not found/error
 */
export async function getSwissData(supabase: SupabaseClient, storagePath: string): Promise<unknown | null> {
    if (!storagePath) {
        console.warn("[getSwissData] No storage path provided");
        return null;
    }

    try {

        const { data, error } = await supabase.storage
            .from('swiss_data')
            .download(storagePath);

        if (error) {
            console.error(`[getSwissData] ❌ Download failed for ${storagePath}:`, error);
            // If the file doesn't exist, we return null rather than throwing
            return null;
        }

        if (!data) {
            console.warn(`[getSwissData] ⚠️ Downloaded data is empty for ${storagePath}`);
            return null;
        }

        const text = await data.text();
        return JSON.parse(text);

    } catch (err) {
        console.error(`[getSwissData] ❌ Unexpected error fetching ${storagePath}:`, err);
        return null;
    }
}
