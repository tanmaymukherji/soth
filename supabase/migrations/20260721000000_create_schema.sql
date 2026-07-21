-- Sense of The House (SoTH) — Schema
-- Run this migration against your Supabase project.

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. Organisation
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'partner'
    CHECK (role IN ('partner', 'partner_admin', 'soth_admin')),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Themes
CREATE TABLE IF NOT EXISTS themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  swaraj_tag TEXT DEFAULT '',
  sort_order INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sub-parameters (global superset)
CREATE TABLE IF NOT EXISTS sub_parameters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  data_type TEXT NOT NULL DEFAULT 'qualitative'
    CHECK (data_type IN ('qualitative','quantitative_scale','quantitative_numeric','text')),
  scale JSONB DEFAULT NULL,
  possible_values JSONB DEFAULT '[]',
  ecosystem TEXT DEFAULT '',
  created_by_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Proposed sub-parameters (approval queue)
CREATE TABLE IF NOT EXISTS proposed_sub_parameters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  theme_id UUID REFERENCES themes(id) ON DELETE SET NULL,
  suggested_theme_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  data_type TEXT DEFAULT 'qualitative',
  scale JSONB DEFAULT NULL,
  possible_values JSONB DEFAULT '[]',
  ecosystem TEXT DEFAULT '',
  proposed_by_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  proposed_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','needs_revision')),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Villages
CREATE TABLE IF NOT EXISTS villages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  gram_panchayat TEXT DEFAULT '',
  block TEXT DEFAULT '',
  district TEXT NOT NULL,
  state TEXT NOT NULL,
  lat NUMERIC,
  lng NUMERIC,
  geom GEOGRAPHY(Point, 4326),
  geocode_source TEXT DEFAULT '',
  geocode_place_id TEXT DEFAULT '',
  geocode_label TEXT DEFAULT '',
  geocoded_at TIMESTAMPTZ,
  geocoded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  geocode_status TEXT DEFAULT 'pending'
    CHECK (geocode_status IN ('pending','geocoded','unmatched','failed')),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, block, district, state)
);

-- 7. Org-Village mapping
CREATE TABLE IF NOT EXISTS org_villages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  village_id UUID NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  start_date DATE DEFAULT CURRENT_DATE,
  soth_marker BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, village_id)
);

-- 8. Captures (append-only time series)
CREATE TABLE IF NOT EXISTS captures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  village_id UUID NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  sub_parameter_id UUID NOT NULL REFERENCES sub_parameters(id) ON DELETE CASCADE,
  value_text TEXT DEFAULT '',
  value_numeric NUMERIC,
  value_scale INT,
  data_type TEXT NOT NULL DEFAULT 'qualitative',
  evidence_url TEXT DEFAULT '',
  captured_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  journey_stage TEXT DEFAULT 'baseline'
    CHECK (journey_stage IN ('awareness','baseline','tracked','achieved')),
  version INT DEFAULT 1
);

-- Index for latest-value queries
CREATE INDEX IF NOT EXISTS idx_captures_lookup
  ON captures(org_id, village_id, sub_parameter_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_captures_current
  ON captures(org_id, village_id, sub_parameter_id)
  WHERE captured_at = (
    SELECT MAX(captured_at) FROM captures c2
    WHERE c2.org_id = captures.org_id
      AND c2.village_id = captures.village_id
      AND c2.sub_parameter_id = captures.sub_parameter_id
  );

-- 9. Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_data JSONB DEFAULT '{}',
  after_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity, entity_id);

-- 10. Journey stages (admin-editable vocab)
CREATE TABLE IF NOT EXISTS journey_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  sort_order INT DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO journey_stages (name, sort_order, description) VALUES
  ('awareness', 1, 'Awareness – community is aware of the parameter'),
  ('baseline', 2, 'Baseline – initial data captured'),
  ('tracked', 3, 'Tracked – regular monitoring in place'),
  ('achieved', 4, 'Achieved – desired outcome reached')
ON CONFLICT (name) DO NOTHING;

-- 11. User roles view (for RLS convenience)
CREATE OR REPLACE VIEW user_roles AS
SELECT p.id, p.org_id, p.role, p.status, o.name AS org_name
FROM profiles p
LEFT JOIN organizations o ON o.id = p.org_id;

-- 12. Latest captures view (materialized-ish)
CREATE OR REPLACE VIEW latest_captures AS
SELECT DISTINCT ON (org_id, village_id, sub_parameter_id)
  id, org_id, village_id, sub_parameter_id,
  value_text, value_numeric, value_scale, data_type,
  evidence_url, captured_by, captured_at, journey_stage, version
FROM captures
ORDER BY org_id, village_id, sub_parameter_id, captured_at DESC;

-- 13. Helper: maturity score per partner per theme
CREATE OR REPLACE FUNCTION compute_partner_theme_maturity(p_org_id UUID, p_theme_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  total_params INT;
  captured_params INT;
  total_villages INT;
  covered_villages INT;
  max_recency_days INT := 90;
  recent_captures INT;
  score NUMERIC;
BEGIN
  -- Parameters count
  SELECT COUNT(*) INTO total_params
  FROM sub_parameters WHERE theme_id = p_theme_id AND status = 'active';
  IF total_params = 0 THEN RETURN 0; END IF;

  -- Distinct parameters captured by this org for this theme
  SELECT COUNT(DISTINCT lc.sub_parameter_id) INTO captured_params
  FROM latest_captures lc
  JOIN sub_parameters sp ON sp.id = lc.sub_parameter_id
  WHERE lc.org_id = p_org_id AND sp.theme_id = p_theme_id;

  -- Village coverage
  SELECT COUNT(*) INTO total_villages
  FROM org_villages WHERE org_id = p_org_id AND status = 'active';
  IF total_villages = 0 THEN RETURN 0; END IF;

  SELECT COUNT(DISTINCT lc.village_id) INTO covered_villages
  FROM latest_captures lc
  JOIN sub_parameters sp ON sp.id = lc.sub_parameter_id
  WHERE lc.org_id = p_org_id AND sp.theme_id = p_theme_id;

  -- Recency: captures in last 90 days
  SELECT COUNT(*) INTO recent_captures
  FROM captures c
  JOIN sub_parameters sp ON sp.id = c.sub_parameter_id
  WHERE c.org_id = p_org_id AND sp.theme_id = p_theme_id
    AND c.captured_at >= NOW() - (max_recency_days || ' days')::INTERVAL;

  score := 0.4 * (captured_params::NUMERIC / total_params)
         + 0.4 * (covered_villages::NUMERIC / NULLIF(total_villages, 0))
         + 0.2 * LEAST(recent_captures::NUMERIC / NULLIF(total_params * total_villages, 1), 1.0);
  RETURN ROUND(score * 100, 1);
END;
$$;
