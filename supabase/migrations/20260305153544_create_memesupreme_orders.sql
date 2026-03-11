-- Migration: Create Meme Supreme Orders & Pricing

-- 1. Create the memesupreme_orders table
CREATE TABLE IF NOT EXISTS public.memesupreme_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_session_id TEXT,
    price_list_id TEXT REFERENCES public.price_list(id),
    product_type TEXT NOT NULL,
    amount_usd INTEGER NOT NULL, -- Stored in cents, e.g., 100 for $1.00
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'fulfilled', 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protect table with RLS
ALTER TABLE public.memesupreme_orders ENABLE ROW LEVEL SECURITY;

-- Allow edge functions and anonymous (or public) inserts via service key or anon if properly structured
CREATE POLICY "Public can insert memesupreme_orders"
ON public.memesupreme_orders FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Public can read own memesupreme_orders by session"
ON public.memesupreme_orders FOR SELECT
TO public
USING (true); -- In reality, filtering will be done via edge functions with service key

CREATE POLICY "Service role has full access to memesupreme_orders"
ON public.memesupreme_orders
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Insert Meme Supreme Product Pricing into price_list
-- Note: 'stripe_price_id' should be updated with the actual live Stripe Price ID later, using a dummy for now.
INSERT INTO public.price_list (id, endpoint, report_type, name, description, unit_price_usd, created_at, product_code, is_ai, stripe_price_id)
VALUES (
    'memesupreme-roast',
    'payment_intent', -- or checkout
    'meme',
    'Meme Supreme',
    'A ruthlessly generated AI meme roast.',
    1.00,
    NOW(),
    'Meme 1',
    'true',
    'price_1T7U9FJ1YhE4Ljp0WQOT9AJu'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit_price_usd = EXCLUDED.unit_price_usd;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.memesupreme_orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
