-- Key-value settings table (e.g. qualitative scoring)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings (public config)
CREATE POLICY "settings_select_public" ON settings
  FOR SELECT USING (true);

-- Seed default qualitative scoring
INSERT INTO settings (key, value) VALUES
  ('qualitative_scoring', '{"yes":100,"no":0,"partially":50}')
ON CONFLICT (key) DO NOTHING;
