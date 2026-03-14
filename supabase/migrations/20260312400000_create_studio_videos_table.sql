-- Table for user-generated video reels (Veo 3.1 via Vertex AI)
CREATE TABLE IF NOT EXISTS public.studio_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    description TEXT,
    goal TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own studio_videos"
ON public.studio_videos FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own studio_videos"
ON public.studio_videos FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own studio_videos"
ON public.studio_videos FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
