// Meme Supreme subscription gate — checks the `subscriptions` table and usage counts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const IMAGES_LIMIT = 48;
const REELS_LIMIT = 5;

interface CheckResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Verify the user has an active subscription and has not exceeded the
 * monthly limit for the given resource type.
 * @param requiredSlots — For "images", how many slots needed (default 1). E.g. 6 for carousel.
 */
export async function checkMemeSubscription(
  userId: string,
  resourceType: "images" | "reels",
  requiredSlots = 1
): Promise<CheckResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Check subscription status and read usage counters in one query
  const { data: sub, error: subErr } = await adminClient
    .from("subscriptions")
    .select("status, current_period_start, current_period_end, images_used, reels_used")
    .eq("user_id", userId)
    .single();

  if (subErr || !sub) {
    return { allowed: false, error: "Subscription required", statusCode: 403 };
  }

  if (sub.status !== "active" && sub.status !== "trialing") {
    return { allowed: false, error: "Subscription required", statusCode: 403 };
  }

  if (!sub.current_period_start || !sub.current_period_end) {
    return { allowed: false, error: "Subscription period not configured", statusCode: 403 };
  }

  // Reject if the subscription period has expired (webhook hasn't updated yet)
  if (new Date(sub.current_period_end) < new Date()) {
    return { allowed: false, error: "Subscription period has ended", statusCode: 403 };
  }

  // 2. Check usage counters (no COUNT queries — counters are maintained by edge functions)
  if (resourceType === "images") {
    if ((sub.images_used ?? 0) + requiredSlots > IMAGES_LIMIT) {
      return { allowed: false, error: `Monthly image limit of ${IMAGES_LIMIT} reached`, statusCode: 403 };
    }
  }

  if (resourceType === "reels") {
    if ((sub.reels_used ?? 0) >= REELS_LIMIT) {
      return { allowed: false, error: `Monthly reel limit of ${REELS_LIMIT} reached`, statusCode: 403 };
    }
  }

  return { allowed: true };
}
