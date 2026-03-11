import type { SupabaseClient } from "./types.ts";

const FAILURE_THRESHOLD = 5;

/**
 * Simplified Circuit Breaker for the chat hot path.
 * Row key is model (not provider), so we can add more models per provider later.
 * - isModelHealthy(model): one DB read to check is_healthy for that model
 * - recordModelFailure(model): increments fail_count, flips is_healthy to false at threshold
 * Recovery is handled exclusively by the llm-health-monitor cron job.
 */
export class SupabaseCircuitBreaker {
    constructor(private supabase: SupabaseClient) { }

    /**
     * Returns true if the given model is healthy and safe to call.
     * Returns true (safe) on DB errors to avoid blocking users.
     * @param model - Model name (e.g. gemini-3-flash-preview); used to look up row in llm_provider_health
     */
    async isModelHealthy(model: string): Promise<boolean> {
        try {
            const { data, error } = await this.supabase
                .from("llm_provider_health")
                .select("is_healthy")
                .eq("model", model)
                .limit(1)
                .maybeSingle();

            if (error || !data) return true; // Default to healthy on error
            return data.is_healthy === true;
        } catch {
            return true;
        }
    }

    /**
     * Returns the active primary model and the designated fallback model.
     * Single DB query filters out inactive models.
     */
    async selectActiveModels(): Promise<{ activeModel: string | null; fallbackModel: string | null }> {
        try {
            const { data, error } = await this.supabase
                .from("llm_provider_health")
                .select("model, is_healthy, is_fallback")
                .eq("is_active", true);

            if (error || !data?.length) {
                return { activeModel: "gemini-3-flash-preview", fallbackModel: "grok-4-1-fast-non-reasoning-latest" };
            }

            type ModelRow = { model: string; is_healthy: boolean; is_fallback: boolean };
            const typedData = data as ModelRow[];

            const primaryModels = typedData.filter(r => !r.is_fallback);
            let activeModel: string | null = null;
            const healthyPrimary = primaryModels.find(m => m.is_healthy !== false);
            if (healthyPrimary) activeModel = healthyPrimary.model;
            else if (primaryModels.length > 0) activeModel = primaryModels[0].model;

            const fallbackModels = typedData.filter(r => r.is_fallback);
            let fallbackModel: string | null = null;
            const healthyFallback = fallbackModels.find(m => m.is_healthy !== false);
            if (healthyFallback) fallbackModel = healthyFallback.model;
            else if (fallbackModels.length > 0) fallbackModel = fallbackModels[0].model;

            return { activeModel, fallbackModel };
        } catch {
            return { activeModel: "gemini-3-flash-preview", fallbackModel: "grok-4-1-fast-non-reasoning-latest" };
        }
    }

    /**
     * Records a success for the given model. Resets fail_count to 0 (consecutive failure tracking).
     */
    async recordModelSuccess(model: string): Promise<void> {
        try {
            await this.supabase
                .from("llm_provider_health")
                .update({
                    fail_count: 0,
                    last_success_at: new Date().toISOString(),
                })
                .eq("model", model);
        } catch (e) {
            console.error("[CircuitBreaker] Failed to record success:", e);
        }
    }

    /**
     * Records a failure for the given model. Increments fail_count.
     * If fail_count reaches the threshold, flips is_healthy to false (stressed).
     * @param model - Model name (e.g. gemini-3-flash-preview); used to identify row in llm_provider_health
     */
    async recordModelFailure(model: string): Promise<void> {
        try {
            const { data, error } = await this.supabase
                .from("llm_provider_health")
                .select("fail_count, is_healthy")
                .eq("model", model)
                .limit(1)
                .maybeSingle();

            if (error || !data) return;

            const newFailCount = (data.fail_count || 0) + 1;
            const wasHealthy = data.is_healthy === true;
            const nowStressed = newFailCount >= FAILURE_THRESHOLD;

            if (nowStressed && wasHealthy) {
                console.warn(`[CircuitBreaker] ${model} hit ${newFailCount} failures. Flipping to stressed — routing to fallback.`);
            }

            await this.supabase
                .from("llm_provider_health")
                .update({
                    fail_count: newFailCount,
                    is_healthy: !nowStressed,
                    last_fail_at: new Date().toISOString(),
                    success_streak: 0,
                })
                .eq("model", model);
        } catch (e) {
            console.error("[CircuitBreaker] Failed to record failure:", e);
        }
    }
}
