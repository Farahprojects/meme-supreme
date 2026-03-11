-- Migration: Add auth_user_id to user_profile for direct user lookups
-- Avoids fetching all users via admin.listUsers() on every auth call

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_user_profile_auth_user_id
  ON public.user_profile (auth_user_id);
