-- Add text_style JSONB to studio_memes so user font/size/caps preference persists
ALTER TABLE public.studio_memes
  ADD COLUMN IF NOT EXISTS text_style JSONB DEFAULT '{}';
