// Shared subscription verification utility for edge functions
import type { SupabaseClient } from "./types.ts";

interface SubscriptionCheckResult {
  hasAccess: boolean;
  isPremium: boolean;
  isAdmin?: boolean;
  error?: string;
}

/**
 * Check if user has active subscription
 */
export async function checkSubscriptionAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionCheckResult> {
  try {
    // Check if user is admin first
    const { data: isAdmin } = await supabase.rpc('check_user_admin_role', {
      user_id_param: userId
    });

    if (isAdmin) {
      return { hasAccess: true, isPremium: true, isAdmin: true };
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_active, subscription_status, subscription_plan")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("[subscriptionCheck] Error fetching subscription:", error);
      return { hasAccess: false, isPremium: false, error: error.message };
    }

    const isActive =
      data?.subscription_active &&
      ["active", "trialing"].includes(data?.subscription_status || "");

    // Check if premium plan
    const planId = data?.subscription_plan || "";
    const isPremium =
      planId === "18_monthly" ||
      planId === "25_monthly" ||
      planId === "subscription_professional" ||
      planId.toLowerCase().includes("premium");

    return {
      hasAccess: isActive,
      isPremium: isPremium && isActive,
    };
  } catch (err) {
    console.error("[subscriptionCheck] Exception:", err);
    return {
      hasAccess: false,
      isPremium: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Check if user has premium plan access
 */
export async function checkPremiumAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionCheckResult> {
  const result = await checkSubscriptionAccess(supabase, userId);

  return {
    ...result,
    hasAccess: result.hasAccess && result.isPremium,
  };
}

