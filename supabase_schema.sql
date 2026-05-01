/* =====================================================================
   FULLINTEL — REVIEW REPORT FEATURE
   Supabase Schema  |  J&J Innovative Medicine — Japan
   Run this entire file in your Supabase SQL Editor
   ===================================================================== */

-- ──────────────────────────────────────────────────────────────────────
-- HELPER: auto-update updated_at on any row change
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- 1.  OUTLETS  (referenced by articles)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS outlets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  url         TEXT,
  country     TEXT,
  language    TEXT,
  media_type  TEXT,   -- Print | Online | Broadcast | Social
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════════════
-- 2.  CONTACTS  (referenced by articles)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  company     TEXT,
  role        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════════════
-- 3.  ARTICLES  (core table — matches Fullintel Add Article form)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS articles (

  -- ── Identity ───────────────────────────────────────────────────────
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- ── Article Tab — Basic Info ────────────────────────────────────────
  heading               TEXT        NOT NULL,          -- "Heading" (title/headline)
  article_url           TEXT,                          -- "Article URL"
  published_date        DATE        NOT NULL,          -- "Published Date" (required *)
  banner_image          TEXT,                          -- "Banner Image" (URL/path)
  views                 INTEGER     DEFAULT 0,         -- "Views"
  related_tweets        TEXT,                          -- "Related Tweets"
  article_media_type    TEXT,                          -- "Article MediaType"
                                                       --   e.g. Print | Online | Broadcast | Social

  -- ── Article Tab — Metrics ───────────────────────────────────────────
  article_reach         NUMERIC(15,2),                 -- "Article Reach"
  national_reach        BOOLEAN     DEFAULT FALSE,     -- "National Reach" checkbox
  ave                   NUMERIC(15,2),                 -- "AVE" (Advertising Value Equivalency)
  national_ave          BOOLEAN     DEFAULT FALSE,     -- "National AVE" checkbox
  media_impact_score    NUMERIC(10,4),                 -- "Media Impact Score"

  -- ── Article Tab — Boolean Flags ─────────────────────────────────────
  is_important          BOOLEAN     DEFAULT FALSE,     -- "Mark as Important"
  behind_paywall        BOOLEAN     DEFAULT FALSE,     -- "Behind PayWall"
  key_sources           BOOLEAN     DEFAULT FALSE,     -- "Key Sources"
  hero_brief            BOOLEAN     DEFAULT FALSE,     -- "hero (Brief)"
  share_article_content BOOLEAN     DEFAULT FALSE,     -- "Share Article Content"
  peripheral_mention    BOOLEAN     DEFAULT FALSE,     -- "Peripheral Mention"
  gilead_article        BOOLEAN     DEFAULT FALSE,     -- "Gilead Article"
  webapp_article        BOOLEAN     DEFAULT FALSE,     -- "Webapp Article"
  hero_topic            BOOLEAN     DEFAULT FALSE,     -- "hero (Topic)"

  -- ── Article Tab — Website Article Category ─────────────────────────
  -- Radio: Article | Press Release | Corporate Newsroom
  website_article_category TEXT DEFAULT 'Article'
    CHECK (website_article_category IN ('Article','Press Release','Corporate Newsroom')),

  -- ── Article Tab — Full Article Content ─────────────────────────────
  full_article          TEXT        NOT NULL,          -- "Full Article *" (rich text / HTML)

  -- ── Content Tagging Tab — Content Categories ───────────────────────
  -- Multi-select checkboxes grouped by type.
  -- Stored as an array of string keys matching the values below.
  content_categories    TEXT[]      DEFAULT '{}',

  -- ── Content Tagging Tab — Content Type ─────────────────────────────
  content_type          TEXT,

  -- ── Status ─────────────────────────────────────────────────────────
  status                TEXT        DEFAULT 'active'
    CHECK (status IN ('active','archived','draft')),

  daily_reach           NUMERIC,
  monthly_reach         NUMERIC,
  summary               TEXT,
  toc_description       TEXT,
  syndicate             BOOLEAN     DEFAULT FALSE,
  total_mention         INTEGER,
  syndicated_reach      NUMERIC,
  article_customize_fields JSONB,
  tonality              TEXT,
  tag_field             TEXT,
  article_comments      TEXT,
  author_socialmedia_id TEXT,
  trending_score        NUMERIC,
  source_country_code   TEXT,
  source_country        TEXT,
  outlets_raw           TEXT,
  contacts_raw          TEXT
);

-- Trigger
CREATE OR REPLACE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS articles_published_date_idx   ON articles(published_date DESC);
CREATE INDEX IF NOT EXISTS articles_status_idx           ON articles(status);
CREATE INDEX IF NOT EXISTS articles_content_type_idx     ON articles(content_type);
CREATE INDEX IF NOT EXISTS articles_categories_idx       ON articles USING gin(content_categories);
CREATE INDEX IF NOT EXISTS articles_heading_search_idx   ON articles USING gin(to_tsvector('english', heading));
CREATE INDEX IF NOT EXISTS articles_is_important_idx     ON articles(is_important) WHERE is_important = TRUE;


-- ══════════════════════════════════════════════════════════════════════
-- 4.  ARTICLE_OUTLETS  (M:M — articles ↔ outlets)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_outlets (
  article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  outlet_id   UUID NOT NULL REFERENCES outlets(id)  ON DELETE CASCADE,
  PRIMARY KEY (article_id, outlet_id)
);


-- ══════════════════════════════════════════════════════════════════════
-- 5.  ARTICLE_CONTACTS  (M:M — articles ↔ contacts)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS article_contacts (
  article_id  UUID NOT NULL REFERENCES articles(id)  ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  PRIMARY KEY (article_id, contact_id)
);


-- ══════════════════════════════════════════════════════════════════════
-- 6.  REPORTS
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  client_name     TEXT        NOT NULL,
  description     TEXT,
  period_start    DATE,
  period_end      DATE,
  report_type     TEXT        DEFAULT 'weekly'
    CHECK (report_type IN ('daily','weekly','monthly','quarterly','annual','custom')),
  notes           TEXT,
  status          TEXT        DEFAULT 'draft'
    CHECK (status IN ('draft','pending','reviewing','approved','rejected')),
  ai_score        INTEGER     CHECK (ai_score BETWEEN 0 AND 100),
  article_count   INTEGER     DEFAULT 0,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS reports_status_idx     ON reports(status);
CREATE INDEX IF NOT EXISTS reports_client_idx     ON reports(client_name);
CREATE INDEX IF NOT EXISTS reports_created_idx    ON reports(created_at DESC);


-- ══════════════════════════════════════════════════════════════════════
-- 7.  REPORT_ARTICLES  (join: reports ↔ articles + review data)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS report_articles (
  id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           UUID      NOT NULL REFERENCES reports(id)  ON DELETE CASCADE,
  article_id          UUID      NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  order_index         INTEGER   DEFAULT 0,
  article_status      TEXT      DEFAULT 'pending'
    CHECK (article_status IN ('pending','approved','rejected')),
  reviewer_note       TEXT,
  ai_score            INTEGER   CHECK (ai_score BETWEEN 0 AND 100),
  verification_data   JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (report_id, article_id)
);

CREATE OR REPLACE TRIGGER report_articles_updated_at
  BEFORE UPDATE ON report_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS ra_report_id_idx   ON report_articles(report_id);
CREATE INDEX IF NOT EXISTS ra_article_id_idx  ON report_articles(article_id);
CREATE INDEX IF NOT EXISTS ra_status_idx      ON report_articles(article_status);


-- ══════════════════════════════════════════════════════════════════════
-- 8.  ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE outlets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_outlets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_articles   ENABLE ROW LEVEL SECURITY;

-- Development: open access — tighten per-user policies before going to production
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['outlets','contacts','articles','article_outlets','article_contacts','reports','report_articles']
  LOOP
    EXECUTE format($f$
      CREATE POLICY "anon_all_%s"  ON %I FOR ALL TO anon          USING (true) WITH CHECK (true);
      CREATE POLICY "auth_all_%s"  ON %I FOR ALL TO authenticated  USING (true) WITH CHECK (true);
    $f$, tbl, tbl, tbl, tbl);
  END LOOP;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- 9.  REFERENCE DATA
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS content_category_lookup (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  group_name  TEXT NOT NULL,
  sort_order  INTEGER
);

INSERT INTO content_category_lookup (key, label, group_name, sort_order) VALUES
  ('corporate',                    'Corporate',                         'Company News',      1),
  ('finance',                      'Finance',                           'Company News',      2),
  ('cardiovascular_metabolism',    'Cardiovascular & Metabolism',       'Products News',    10),
  ('immunology',                   'Immunology',                        'Products News',    11),
  ('infectious_diseases_vaccines', 'Infectious Diseases and Vaccines',  'Products News',    12),
  ('neuroscience',                 'Neuroscience',                      'Products News',    13),
  ('oncology',                     'Oncology',                          'Products News',    14),
  ('pulmonary_hypertension',       'Pulmonary Hypertension',            'Products News',    15),
  ('others_products',              'Others',                            'Products News',    16),
  ('daiichi_sankyo',               'Daiichi Sankyo',                    'Competitors News', 20),
  ('takeda',                       'Takeda',                            'Competitors News', 21),
  ('astrazeneca',                  'AstraZeneca',                       'Competitors News', 22),
  ('merck',                        'Merck',                             'Competitors News', 23),
  ('pfizer',                       'Pfizer',                            'Competitors News', 24),
  ('pharma_trends',                'Pharma Trends',                     'Industry News',    30),
  ('drug_pricing',                 'Drug Pricing',                      'Industry News',    31),
  ('politics_policy',              'Politics/Policy',                   'Industry News',    32),
  ('regulatory',                   'Regulatory',                        'Industry News',    33),
  ('rnd',                          'R&D',                               'Industry News',    34)
ON CONFLICT (key) DO NOTHING;


CREATE TABLE IF NOT EXISTS content_type_lookup (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  sort_order  INTEGER
);

INSERT INTO content_type_lookup (key, label, sort_order) VALUES
  ('company_news_ja',        'Company News - Japanese',    1),
  ('company_news_en',        'Company News - English',     2),
  ('product_news_ja',        'Product News - Japanese',    3),
  ('product_news_en',        'Product News - English',     4),
  ('competitor_news_ja',     'Competitor News - Japanese', 5),
  ('competitor_news_en',     'Competitor News - English',  6),
  ('industry_news_ja',       'Industry News - Japanese',   7),
  ('industry_news_en',       'Industry News - English',    8),
  ('competitor_news_names',  'Competitor News Names',      9)
ON CONFLICT (key) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════
-- 10. NEWSLETTERS & STANDARDS
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS newsletters (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  title                 TEXT        NOT NULL,
  template_name         TEXT        DEFAULT 'New - Media Imp',
  subject_type          TEXT        DEFAULT 'Custom',
  banner_date           DATE,
  heading_type          TEXT        DEFAULT 'Default',
  report_id             UUID        REFERENCES reports(id) ON DELETE SET NULL,
  published_on          DATE,
  distribution_list     TEXT        DEFAULT 'DEFAULT',
  status                TEXT        DEFAULT 'draft' CHECK (status IN ('draft','sent','archived'))
);

CREATE TABLE IF NOT EXISTS newsletter_articles (
  newsletter_id         UUID        REFERENCES newsletters(id) ON DELETE CASCADE,
  article_id            UUID        REFERENCES articles(id) ON DELETE CASCADE,
  order_index           INTEGER     DEFAULT 0,
  PRIMARY KEY (newsletter_id, article_id)
);

CREATE TABLE IF NOT EXISTS standards (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  title                 TEXT        NOT NULL,
  content               TEXT        NOT NULL,
  is_active             BOOLEAN     DEFAULT TRUE,
  version               TEXT        DEFAULT '1.0'
);

ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all newsletters" ON newsletters FOR ALL USING (true);
CREATE POLICY "Allow all newsletter_articles" ON newsletter_articles FOR ALL USING (true);
CREATE POLICY "Allow all standards" ON standards FOR ALL USING (true);


-- ══════════════════════════════════════════════════════════════════════
-- 11. FLEXIBLE EDITORIAL RULE ENGINE
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fullintel_standards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  version     TEXT DEFAULT '1.0',
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_standards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name         TEXT NOT NULL UNIQUE,
  inherits_from_id    UUID REFERENCES fullintel_standards(id) ON DELETE SET NULL,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fullintel_standard_id UUID REFERENCES fullintel_standards(id) ON DELETE CASCADE,
  client_standard_id    UUID REFERENCES client_standards(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  category              TEXT NOT NULL,
  component             TEXT NOT NULL,
  condition             JSONB NOT NULL,
  action_type           TEXT NOT NULL,
  severity              TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  priority              INTEGER DEFAULT 10,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (fullintel_standard_id IS NOT NULL AND client_standard_id IS NULL) OR
    (fullintel_standard_id IS NULL AND client_standard_id IS NOT NULL)
  )
);

ALTER TABLE fullintel_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_standards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules               ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all fi_std" ON fullintel_standards FOR ALL USING (true);
CREATE POLICY "Allow all c_std"  ON client_standards    FOR ALL USING (true);
CREATE POLICY "Allow all rules"  ON rules               FOR ALL USING (true);


-- ══════════════════════════════════════════════════════════════════════
-- 12. INSIGHT BRIEF & REPORT BUILDER
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS insight_brief_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('ai_generated', 'user_edited')),
  is_active   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_final_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  logo_url        TEXT,
  text_alignment  TEXT DEFAULT 'left',
  theme_color     TEXT DEFAULT '#0097a7',
  font_family     TEXT DEFAULT 'Inter',
  header_style    TEXT DEFAULT 'classic',
  show_page_border BOOLEAN DEFAULT FALSE,
  border_color    TEXT DEFAULT '#e2e8f0',
  content_spacing TEXT DEFAULT 'normal',
  final_content   TEXT,
  is_finalized    BOOLEAN DEFAULT FALSE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE insight_brief_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_final_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all ibv" ON insight_brief_versions FOR ALL USING (true);
CREATE POLICY "Allow all rfc" ON report_final_configs FOR ALL USING (true);


-- ══════════════════════════════════════════════════════════════════════
-- 13. KEYWORDS
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS keywords (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word                 TEXT NOT NULL UNIQUE,
    category         TEXT DEFAULT 'general',
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all keywords" ON keywords FOR ALL USING (true);

-- AI Assist History Table
CREATE TABLE IF NOT EXISTS ai_assist_history (
  id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           UUID      NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  keyword             TEXT,
  date_range          TEXT,
  prompt              TEXT,
  content             TEXT      NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_assist_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access to ai_assist_history" ON ai_assist_history FOR ALL USING (true);