/* =====================================================================
   FULLINTEL — QA REPORTING & AI INSIGHTS
   Supabase Schema Extension
   ===================================================================== */

-- 1. QA Error Logs (Persistence for detected errors)
CREATE TABLE IF NOT EXISTS qa_error_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id     UUID REFERENCES reports(id) ON DELETE CASCADE, -- Points to reports(id) as per Newsletter.jsx
  report_id         UUID REFERENCES reports(id) ON DELETE CASCADE,
  client_name       TEXT NOT NULL,
  rule_id           UUID REFERENCES rules(id) ON DELETE SET NULL,
  error_type        TEXT,           -- e.g., 'editorial', 'metadata'
  severity          TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  message           TEXT NOT NULL,
  content_snippet   TEXT,           -- The text that caused the error
  field_name        TEXT,           -- e.g., 'headline', 'body'
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Newsletter Quality Scores (Aggregated metrics per newsletter)
CREATE TABLE IF NOT EXISTS newsletter_quality_stats (
  newsletter_id     UUID PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE, -- Points to reports(id)
  newsletter_title  TEXT,
  client_name       TEXT NOT NULL,
  quality_score     NUMERIC(5,2),   -- 0.00 to 100.00
  total_errors      INTEGER DEFAULT 0,
  critical_errors   INTEGER DEFAULT 0,
  warning_errors    INTEGER DEFAULT 0,
  info_errors       INTEGER DEFAULT 0,
  analyzed_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. AI Insights (Persistent storage for generated insights to avoid redundant API calls)
CREATE TABLE IF NOT EXISTS client_qa_insights (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name       TEXT NOT NULL UNIQUE,
  summary           TEXT,           -- Natural language summary
  patterns          JSONB,          -- Detected recurring patterns
  recommendations   JSONB,          -- Actionable improvements
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE qa_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_quality_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_qa_insights ENABLE ROW LEVEL SECURITY;

-- Development: Open Access
CREATE POLICY "Allow all qa_error_logs" ON qa_error_logs FOR ALL USING (true);
CREATE POLICY "Allow all newsletter_quality_stats" ON newsletter_quality_stats FOR ALL USING (true);
CREATE POLICY "Allow all client_qa_insights" ON client_qa_insights FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS qa_logs_client_idx ON qa_error_logs(client_name);
CREATE INDEX IF NOT EXISTS qa_logs_newsletter_idx ON qa_error_logs(newsletter_id);
CREATE INDEX IF NOT EXISTS qa_logs_created_idx ON qa_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS quality_stats_client_idx ON newsletter_quality_stats(client_name);
