import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export const IMAGES_LIMIT = 48;
export const REELS_LIMIT = 5;

export interface SubscriptionState {
    isSubscribed: boolean;
    status: string | null;
    imagesUsed: number;
    imagesLimit: number;
    reelsUsed: number;
    reelsLimit: number;
    periodEnd: Date | null;
    periodStart: Date | null;
    loading: boolean;
}

const DEFAULT_STATE: SubscriptionState = {
    isSubscribed: false,
    status: null,
    imagesUsed: 0,
    imagesLimit: IMAGES_LIMIT,
    reelsUsed: 0,
    reelsLimit: REELS_LIMIT,
    periodEnd: null,
    periodStart: null,
    loading: true,
};

export function useSubscription(): SubscriptionState {
    const { user, loading: authLoading } = useAuth();
    const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            setState({ ...DEFAULT_STATE, loading: false });
            return;
        }

        let cancelled = false;

        async function fetchSubscription() {
            setState((prev) => ({ ...prev, loading: true }));

            // 1. Fetch subscription row — usage counters included, no COUNT queries needed
            const { data: sub } = await supabase
                .from("subscriptions")
                .select("status, current_period_start, current_period_end, images_used, reels_used")
                .eq("user_id", user!.id)
                .single();

            if (cancelled) return;

            const isSubscribed =
                sub?.status === "active" || sub?.status === "trialing";
            const periodStart = sub?.current_period_start
                ? new Date(sub.current_period_start)
                : null;
            const periodEnd = sub?.current_period_end
                ? new Date(sub.current_period_end)
                : null;

            if (!isSubscribed || !periodStart) {
                setState({
                    isSubscribed: false,
                    status: sub?.status ?? null,
                    imagesUsed: 0,
                    imagesLimit: IMAGES_LIMIT,
                    reelsUsed: 0,
                    reelsLimit: REELS_LIMIT,
                    periodEnd,
                    periodStart,
                    loading: false,
                });
                return;
            }

            setState({
                isSubscribed: true,
                status: sub.status,
                imagesUsed: sub.images_used ?? 0,
                imagesLimit: IMAGES_LIMIT,
                reelsUsed: sub.reels_used ?? 0,
                reelsLimit: REELS_LIMIT,
                periodEnd,
                periodStart,
                loading: false,
            });
        }

        fetchSubscription();

        return () => {
            cancelled = true;
        };
    }, [user, authLoading]);

    return state;
}
