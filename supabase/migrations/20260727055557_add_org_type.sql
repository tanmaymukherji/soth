-- Add org_type to organizations: 'partner' (counted in stats) or 'observer' (not counted)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_type TEXT DEFAULT 'partner'
  CHECK (org_type IN ('partner', 'observer'));
