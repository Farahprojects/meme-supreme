-- Migration: Create custom auth tables (user_profile, otc_tokens)

-- 1. Create user_profile table
CREATE TABLE IF NOT EXISTS public.user_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    is_email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Protect user_profile with RLS (only service role or the owner can access)
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" 
ON public.user_profile
FOR SELECT 
USING (email = (auth.jwt() ->> 'email'));

-- 2. Create otc_tokens table
CREATE TABLE IF NOT EXISTS public.otc_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- We do NOT enable RLS on otc_tokens because the user is not authenticated yet when they interact with it.
-- ONLY the Edge Function (using service_role key) should ever touch this table.
-- Let's explicitly deny all public access just to be safe.
ALTER TABLE public.otc_tokens ENABLE ROW LEVEL SECURITY;

-- No policies means default deny for anon/authenticated roles.
