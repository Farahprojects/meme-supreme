-- Carousel support: studio_carousels + extend studio_memes for slides
CREATE TABLE IF NOT EXISTS public.studio_carousels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    format              TEXT NOT NULL CHECK (format IN ('teach', 'story', 'authority')),
    context_description TEXT,
    tone                TEXT NOT NULL CHECK (tone IN ('roast', 'funny', 'sweet', 'bold')),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.studio_carousels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own studio carousels"
ON public.studio_carousels FOR ALL
USING (auth.uid() = user_id);

-- Extend studio_memes for carousel slides
ALTER TABLE public.studio_memes
  ADD COLUMN IF NOT EXISTS carousel_id UUID REFERENCES public.studio_carousels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slide_index SMALLINT;
