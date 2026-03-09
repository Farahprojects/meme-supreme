-- Create the generated-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'generated-images',
    'generated-images',
    true,
    52428800, -- 50MB
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET 
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];




-- Allow public read access (since these are publicly shareable meme images)
CREATE POLICY "Public Read Access: generated-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'generated-images');

-- Allow authenticated users / service role to insert
CREATE POLICY "Insert Access: generated-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'generated-images');

-- Allow authenticated users / service role to update
CREATE POLICY "Update Access: generated-images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'generated-images');

-- Allow authenticated users / service role to delete
CREATE POLICY "Delete Access: generated-images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'generated-images');
