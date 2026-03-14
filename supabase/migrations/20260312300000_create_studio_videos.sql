-- Storage bucket for studio-generated reels (Veo 3.1)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'studio-videos',
    'studio-videos',
    true,
    52428800,
    ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
    allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

DROP POLICY IF EXISTS "Public read studio-videos bucket" ON storage.objects;
CREATE POLICY "Public read studio-videos bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'studio-videos');

DROP POLICY IF EXISTS "Insert studio-videos" ON storage.objects;
CREATE POLICY "Insert studio-videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'studio-videos');

DROP POLICY IF EXISTS "Update studio-videos" ON storage.objects;
CREATE POLICY "Update studio-videos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'studio-videos');

DROP POLICY IF EXISTS "Delete studio-videos" ON storage.objects;
CREATE POLICY "Delete studio-videos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'studio-videos');
