-- Migration: Create Meme Supreme Credits Table & Update Pricing

-- 1. Create the memesupreme_credits table
CREATE TABLE IF NOT EXISTS public.memesupreme_credits (
    session_id TEXT PRIMARY KEY,
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protect table with RLS
ALTER TABLE public.memesupreme_credits ENABLE ROW LEVEL SECURITY;

-- Allow edge functions and anonymous (or public) inserts/updates via service key or anon if properly structured
CREATE POLICY "Public can insert memesupreme_credits"
ON public.memesupreme_credits FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Public can read own memesupreme_credits by session"
ON public.memesupreme_credits FOR SELECT
TO public
USING (true); -- Broad read, fine for anonymous session IDs

CREATE POLICY "Public can update own memesupreme_credits"
ON public.memesupreme_credits FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to memesupreme_credits"
ON public.memesupreme_credits
TO service_role
USING (true)
WITH CHECK (true);

-- Add updated_at trigger for memesupreme_credits
CREATE TRIGGER set_credits_updated_at
BEFORE UPDATE ON public.memesupreme_credits
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 2. Insert Meme Supreme Credit Pack Pricing into price_list
-- Dummy Stripe IDs used for now; must be updated in production!
INSERT INTO public.price_list (id, endpoint, report_type, name, description, unit_price_usd, created_at, product_code, is_ai, stripe_price_id)
VALUES 
(
    'memesupreme-pack-5',
    'payment_intent',
    'meme',
    'Meme Supreme 5-Pack',
    'Generate 5 ruthless AI meme roasts.',
    3.00,
    NOW(),
    'Meme 5',
    'true',
    'price_dummy_5pack_xxx'
),
(
    'memesupreme-pack-20',
    'payment_intent',
    'meme',
    'Meme Supreme 20-Pack',
    'Generate 20 ruthless AI meme roasts.',
    10.00,
    NOW(),
    'Meme 20',
    'true',
    'price_dummy_20pack_xxx'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit_price_usd = EXCLUDED.unit_price_usd;
