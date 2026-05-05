-- API usage log — records every Anthropic and Deepgram call with token counts and USD cost.
-- Used by the admin dashboard for cost tracking and financial reporting.
-- Rows are written by the Railway server using the service role key (via usageLogger.ts).
-- No RLS is enabled — this table is server-only (service role bypass); the anon key cannot reach it.

CREATE TABLE IF NOT EXISTS api_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  service       TEXT             NOT NULL CHECK (service IN ('anthropic', 'deepgram')),
  model         TEXT             NOT NULL,
  endpoint      TEXT             NOT NULL,
  inspection_id UUID             REFERENCES inspections(id) ON DELETE SET NULL,
  user_id       UUID             REFERENCES users(id)       ON DELETE SET NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  audio_seconds NUMERIC(10,2),
  cost_usd      NUMERIC(10,6)    NOT NULL
);

-- Index for the monthly cost queries used in the dashboard
CREATE INDEX idx_api_usage_log_created_at  ON api_usage_log (created_at DESC);
CREATE INDEX idx_api_usage_log_inspection  ON api_usage_log (inspection_id);
CREATE INDEX idx_api_usage_log_service     ON api_usage_log (service);
