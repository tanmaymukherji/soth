-- Custom auth users table (bypasses Supabase auth.email limits)
CREATE TABLE IF NOT EXISTS local_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'partner'
    CHECK (role IN ('partner', 'partner_admin', 'soth_admin')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'pending', 'inactive')),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_users_email ON local_users(email);
