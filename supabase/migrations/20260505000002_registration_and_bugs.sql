-- ─── PM Roster ────────────────────────────────────────────────────────────────
-- Pre-approved list of property managers. Registration requires selecting a
-- name from this list, and the supplied email must match the roster entry.
-- Only admins (via Supabase dashboard / service role) manage this table.

CREATE TABLE public.pm_roster (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  TEXT        NOT NULL UNIQUE,
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pm_roster ENABLE ROW LEVEL SECURITY;

-- Public read — unauthenticated users need to see the list during registration
CREATE POLICY "pm_roster_public_select" ON public.pm_roster
  FOR SELECT USING (true);

-- Seed with current PMs
INSERT INTO public.pm_roster (full_name, email) VALUES
  ('Ben Graham', 'ben240689@proton.me'),
  ('Pete Birch', 'petebirchpm@proton.me');


-- ─── Auto-create public.users on signup ───────────────────────────────────────
-- When Supabase Auth creates a new auth.users row, this trigger inserts the
-- matching public.users profile using full_name from the signup metadata.
-- SECURITY DEFINER runs as the function owner, bypassing RLS on public.users.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    'inspector',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ─── Bug Reports ──────────────────────────────────────────────────────────────

CREATE TABLE public.bug_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name TEXT        NOT NULL,
  type          TEXT        NOT NULL CHECK (type IN ('bug', 'suggestion')),
  description   TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Inspectors can submit reports
CREATE POLICY "bug_reports_insert_own" ON public.bug_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Admins can read all reports
CREATE POLICY "bug_reports_select_admin" ON public.bug_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
