-- ─── Bug report status tracking ──────────────────────────────────────────────
-- Adds status / resolution / duplicate-merging columns to bug_reports so admins
-- can manage the lifecycle of an issue, and inspectors can see when their
-- reports are fixed (with version + notes) from a new in-app "My Reports" view.

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS status            TEXT        NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolution_notes  TEXT,
  ADD COLUMN IF NOT EXISTS resolved_version  TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of      UUID        REFERENCES public.bug_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

-- Restrict status to known values
ALTER TABLE public.bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_status_check;

ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN ('open', 'in_progress', 'fixed', 'wont_fix', 'duplicate'));

-- Helpful index for the "my reports" view (most recent first)
CREATE INDEX IF NOT EXISTS bug_reports_reporter_id_created_at_idx
  ON public.bug_reports (reporter_id, created_at DESC);

-- ── updated_at trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bug_reports_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bug_reports_set_updated_at ON public.bug_reports;

CREATE TRIGGER bug_reports_set_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.bug_reports_touch_updated_at();

-- ── RLS: inspectors can read their own reports ────────────────────────────────
-- Existing policies kept as-is. Adding SELECT for the reporter so the My
-- Reports screen can query bug_reports via the anon-key client.

DROP POLICY IF EXISTS "bug_reports_select_own" ON public.bug_reports;

CREATE POLICY "bug_reports_select_own" ON public.bug_reports
  FOR SELECT USING (auth.uid() = reporter_id);
