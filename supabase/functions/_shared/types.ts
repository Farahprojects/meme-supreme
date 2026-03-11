/**
 * Shared types for edge functions. Use these instead of `any` or lint-ignore.
 */
export type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

/** Swiss RPC context shape (person_a / person_b) - use unknown when full typing is not needed. */
export type SwissContextResult = { person_a: unknown; person_b: unknown };

/** EdgeRuntime.waitUntil is provided by Deno Deploy / edge runtimes; avoid @ts-ignore by typing the global. */
export type EdgeRuntimeLike = {
  waitUntil(promise: Promise<unknown>): void;
};

export function getEdgeRuntime(): EdgeRuntimeLike | undefined {
  return (globalThis as unknown as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;
}

export function waitUntilIfAvailable(promise: Promise<unknown>): void {
  const runtime = getEdgeRuntime();
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
  } else {
    promise.catch((err) => console.error("[waitUntil] background task error:", err));
  }
}
