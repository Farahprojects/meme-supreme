-- Library images table: public feed of memes (caption stored separately, no VPS binding)
CREATE TABLE IF NOT EXISTS public.library_images (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url    TEXT NOT NULL,
    tone         TEXT NOT NULL CHECK (tone IN ('roast', 'funny', 'sweet', 'bold')),
    caption      TEXT NOT NULL,
    names        TEXT,
    is_published BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.library_images ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can see published rows only
CREATE POLICY "Public read published library images"
ON public.library_images FOR SELECT
TO public
USING (is_published = true);

-- Only service role can insert/update/delete (no anon write)
-- No policy = deny for anon/authenticated; service role bypasses RLS

-- Storage bucket for library images (raw images, no text baked in)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'library-images',
    'library-images',
    true,
    52428800,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

CREATE POLICY "Public read library-images bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'library-images');

CREATE POLICY "Insert library-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'library-images');

CREATE POLICY "Update library-images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'library-images');

CREATE POLICY "Delete library-images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'library-images');
