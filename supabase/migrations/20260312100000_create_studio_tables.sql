-- Studio memes: per-user generated memes (4 tones per run), editable, saved to account
CREATE TABLE IF NOT EXISTS public.studio_memes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_names          TEXT,
    context_description   TEXT,
    reference_description TEXT,
    tone                  TEXT NOT NULL CHECK (tone IN ('roast', 'funny', 'sweet', 'bold')),
    image_url             TEXT NOT NULL,
    caption               TEXT NOT NULL,
    names                 TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.studio_memes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own studio memes"
ON public.studio_memes FOR ALL
USING (auth.uid() = user_id);

-- Storage bucket for studio-generated images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'studio-images',
    'studio-images',
    true,
    52428800,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

CREATE POLICY "Public read studio-images bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'studio-images');

CREATE POLICY "Insert studio-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'studio-images');

CREATE POLICY "Update studio-images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'studio-images');

CREATE POLICY "Delete studio-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'studio-images');
