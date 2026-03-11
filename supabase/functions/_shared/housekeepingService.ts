 // Housekeeping Service - Inlined logic to eliminate HTTP hop
 // Handles: turn count updates, memory usage tracking
 // NOTE: Usage increment removed - already handled by messagePersistenceService
 
 import type { SupabaseClient } from "./types.ts";
 import { updateMemoryUsage } from "./memoryInjection.ts";
 
 export interface HousekeepingPayload {
   chat_id: string;
   user_id?: string | null;
   memory_ids?: string[];
   requestId?: string;
 }
 
 /**
  * Perform housekeeping tasks directly without HTTP hop.
  * Saves ~100-300ms per request by avoiding internal function call.
  */
 export async function performHousekeeping(
   supabase: SupabaseClient,
   payload: HousekeepingPayload
 ): Promise<void> {
   const { chat_id, memory_ids, requestId } = payload;
 
   try {
     // 1. Update Turn Count
     const { data: conversationMeta, error: convErr } = await supabase
       .from("conversations")
       .select("turn_count")
       .eq("id", chat_id)
       .single();
 
     if (!convErr && conversationMeta) {
       const newTurnCount = (conversationMeta.turn_count || 0) + 1;
       await supabase.from("conversations").update({ turn_count: newTurnCount }).eq("id", chat_id);
     }
 
     // 2. Memory Usage Tracking
     if (memory_ids && memory_ids.length > 0) {
       await updateMemoryUsage(supabase, memory_ids);
       console.log(`[Housekeeping][${requestId}] Updated memory usage for chat ${chat_id}`);
     }
 
     // NOTE: User message increment is NOT done here.
     // It's already handled in messagePersistenceService.ts:141-156
     // Duplicate increment was removed to prevent double-counting.
 
   } catch (err) {
     console.error(`[Housekeeping][${requestId}] Error:`, err);
   }
 }