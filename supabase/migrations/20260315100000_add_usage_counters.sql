-- Add usage counter columns to subscriptions table.
-- Counters are incremented by edge functions on each successful generation,
-- and reset to 0 by the Stripe webhook when a billing period renews.
-- This replaces COUNT(*) queries against studio_memes / studio_videos.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS images_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reels_used  INTEGER NOT NULL DEFAULT 0;

-- Atomic increment function called by edge functions after each generation.
-- Avoids race conditions — Postgres handles the +N atomically.
CREATE OR REPLACE FUNCTION public.increment_subscription_counter(
  p_user_id UUID,
  p_column  TEXT,
  p_amount  INT DEFAULT 1
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.subscriptions
  SET
    images_used = CASE WHEN p_column = 'images_used' THEN images_used + p_amount ELSE images_used END,
    reels_used  = CASE WHEN p_column = 'reels_used'  THEN reels_used  + p_amount ELSE reels_used  END
  WHERE user_id = p_user_id;
$$;
