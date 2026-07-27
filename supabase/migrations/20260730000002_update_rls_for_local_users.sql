-- Update RLS helper functions to check local_users via auth_id

-- is_soth_admin: checks both profiles (legacy) and local_users (new)
CREATE OR REPLACE FUNCTION public.is_soth_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'soth_admin' AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM local_users
    WHERE auth_id = auth.uid() AND role = 'soth_admin' AND status = 'active'
  );
$$;

-- is_org_admin: checks local_users via auth_id
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND org_id = is_org_admin.org_id
      AND role IN ('partner_admin','soth_admin')
      AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM local_users
    WHERE auth_id = auth.uid()
      AND org_id = is_org_admin.org_id
      AND role IN ('partner_admin','soth_admin')
      AND status = 'active'
  );
$$;

-- user_org_id: checks local_users via auth_id
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
  UNION
  SELECT org_id FROM local_users WHERE auth_id = auth.uid()
  LIMIT 1;
$$;
