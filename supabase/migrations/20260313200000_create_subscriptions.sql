-- Subscriptions table: one row per user, written by service_role (Stripe webhook)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id     TEXT,
    plan_id                TEXT REFERENCES public.price_list(id),
    status                 TEXT NOT NULL DEFAULT 'inactive',
    -- status values: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'
    current_period_start   TIMESTAMPTZ,
    current_period_end     TIMESTAMPTZ,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription row; all writes go through service_role
CREATE POLICY "Users read own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.handle_subscriptions_updated_at();
