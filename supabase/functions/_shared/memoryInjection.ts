// Shared memory injection logic for LLM handlers with smart caching
import type { SupabaseClient } from "./types.ts";

type MemoryResult = {
  memoryContext: string;
  memoryIds: string[];
};

// Minimal in-memory cache for memory fetch (replaces queryCache dependency for this module only)
const memoryCache = new Map<string, { data: MemoryResult; expires: number }>();
const MEMORY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

async function getCachedOrFetch(
  key: string,
  fetchFn: () => Promise<MemoryResult>
): Promise<MemoryResult> {
  const entry = memoryCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  const data = await fetchFn();
  memoryCache.set(key, { data, expires: Date.now() + MEMORY_CACHE_TTL_MS });
  if (memoryCache.size > 50) {
    const oldest = [...memoryCache.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (let i = 0; i < oldest.length - 50; i++) memoryCache.delete(oldest[i][0]);
  }
  return data;
}

type Memory = {
  id: string;
  memory_text: string;
  memory_type: 'goal' | 'pattern' | 'emotion' | 'fact' | 'relationship';
  confidence_score: number;
  created_at: string;
  reference_count: number;
};

type WeeklySummary = {
  emotional_summary: string;
  week_start_date: string;
  week_end_date: string;
};

type MonthlySummary = {
  emotional_summary: string;
  cognitive_summary: string | null;
  key_themes: string[] | null;
  month: number;
  year: number;
};

// Unused weight/topic constants removed for unbloating

// Topic classification removed for simplicity - focusing on semantic relevance and pins

export async function fetchAndFormatMemories(
  supabase: SupabaseClient,
  chatId: string,
  _lastUserMessage: string = ""
): Promise<MemoryResult> {
  try {
    const cacheKey = `memories:v2:${chatId}`;

    const result = await getCachedOrFetch(cacheKey, async () => {
      // Single RPC: conversation + translator_logs + user_profile_list (replaces 3 sequential queries)
      const { data: guard, error: guardError } = await supabase
        .rpc('get_memory_injection_guard', { p_chat_id: chatId });

      if (guardError || !guard) {
        return { memoryContext: '', memoryIds: [] };
      }

      const userId = guard.user_id as string | null;
      const shouldInject = guard.should_inject as boolean;
      const personAProfileName = guard.person_a_profile_name as string | null;

      if (!userId || !shouldInject) {
        if (personAProfileName) {
          console.log(`[memoryInjection] Skipping: person_a is "${personAProfileName}" (not primary profile)`);
        }
        return { memoryContext: '', memoryIds: [] };
      }

      // Parallel Queries: STM + pinned LTM only. Pattern signals are NOT fed into LLM context (kept for UI/analytics).
      const stmQuery = supabase
        .from('short_term_memory')
        .select('id, content, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);

      const pinnedLtmQuery = supabase
        .from('user_memory')
        .select('id, memory_text, memory_type, created_at, pinned')
        .eq('user_id', userId)
        .eq('pinned', true)
        .limit(10);

      const [stmResult, pinnedLtmResult] = await Promise.all([
        stmQuery,
        pinnedLtmQuery
      ]);

      const stm = stmResult?.data || [];
      const pinnedLtm = pinnedLtmResult?.data || [];
      const uniqueLtm = pinnedLtm;

      // Build Context Sections
      const sections: string[] = [];

      // Section A: BIOGRAPHY (LTM) -> The Life
      if (uniqueLtm.length > 0) {
        const ltmList = uniqueLtm.map((m: { memory_text: string }) =>
          `• ${m.memory_text}`
        ).join('\n');
        sections.push(`## User Biography (Facts)\n${ltmList}`);
      }

      // Section B: Recent Context (STM) -> The Buffer
      if (stm.length > 0) {
        const stmList = stm.map((m: { content: string }) => `• [Recent] ${m.content}`).join('\n');
        sections.push(`## Recent Context\n${stmList}`);
      }

      const memoryContext = sections.join('\n\n');
      const memoryIds = uniqueLtm.map((m: { id: string }) => m.id);

      return { memoryContext, memoryIds };
    });

    return result;
  } catch (error) {
    console.error('[memoryInjection] Error fetching memories:', error);
    return { memoryContext: '', memoryIds: [] };
  }
}

export async function updateMemoryUsage(
  supabase: SupabaseClient,
  memoryIds: string[]
): Promise<void> {
  if (memoryIds.length === 0) return;

  try {
    const now = new Date().toISOString();

    // Update all memories at once
    for (const id of memoryIds) {
      const { data: current } = await supabase
        .from('user_memory')
        .select('reference_count')
        .eq('id', id)
        .single();

      await supabase
        .from('user_memory')
        .update({
          last_referenced_at: now,
          reference_count: (current?.reference_count || 0) + 1
        })
        .eq('id', id);
    }

    console.log(`[memoryInjection] Updated ${memoryIds.length} memory usage counts`);
  } catch (error) {
    console.error('[memoryInjection] Error updating memory usage:', error);
  }
}

