-- Add job_title to users table.
-- This allows the inspector's professional title to appear correctly in the
-- report declaration section rather than using a hardcoded string.
-- Default: 'Property Manager' — update individual records in the Supabase
-- dashboard (Table Editor → users) to set the correct title per inspector.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS job_title TEXT NOT NULL DEFAULT 'Property Manager';
