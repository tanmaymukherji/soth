-- SoTH — Row Level Security policies

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposed_sub_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE villages ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_villages ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_stages ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION public.is_soth_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'soth_admin' AND status = 'active'
  );
$$;

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
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$$;

-- --- Organizations ---
-- Anyone can SELECT active orgs (public listing)
CREATE POLICY "org_select_public" ON organizations
  FOR SELECT USING (status = 'active');
-- Admin can INSERT/UPDATE/DELETE
CREATE POLICY "org_admin_all" ON organizations
  FOR ALL USING (public.is_soth_admin());

-- --- Profiles ---
-- Users can SELECT own profile, soth_admin can SELECT all
CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT USING (id = auth.uid() OR public.is_soth_admin());
-- Users can UPDATE own limited fields; soth_admin can UPDATE all
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL USING (public.is_soth_admin());

-- --- Themes ---
-- Public SELECT
CREATE POLICY "themes_select_public" ON themes
  FOR SELECT USING (true);
-- Admin INSERT/UPDATE/DELETE
CREATE POLICY "themes_admin_all" ON themes
  FOR ALL USING (public.is_soth_admin());

-- --- Sub-parameters ---
-- Public SELECT (active only)
CREATE POLICY "sub_params_select_public" ON sub_parameters
  FOR SELECT USING (status = 'active');
-- Admin INSERT/UPDATE/DELETE
CREATE POLICY "sub_params_admin_all" ON sub_parameters
  FOR ALL USING (public.is_soth_admin());

-- --- Proposed sub-parameters ---
-- SELECT: proposer org or soth_admin
CREATE POLICY "proposed_select_own_or_admin" ON proposed_sub_parameters
  FOR SELECT USING (
    proposed_by_org_id = public.user_org_id()
    OR public.is_soth_admin()
  );
-- INSERT: any authenticated user from an org
CREATE POLICY "proposed_insert_auth" ON proposed_sub_parameters
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- UPDATE/DELETE: soth_admin only
CREATE POLICY "proposed_admin_all" ON proposed_sub_parameters
  FOR ALL USING (public.is_soth_admin());

-- --- Villages ---
-- Public SELECT (villages are shared reference data)
CREATE POLICY "villages_select_public" ON villages
  FOR SELECT USING (true);
-- Admin INSERT/UPDATE/DELETE
CREATE POLICY "villages_admin_all" ON villages
  FOR ALL USING (public.is_soth_admin());

-- --- Org-Villages ---
-- Public SELECT (reference data — who works in which village is not sensitive)
CREATE POLICY "org_villages_select_public" ON org_villages
  FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE: own org_admin or soth_admin
CREATE POLICY "org_villages_manage" ON org_villages
  FOR ALL USING (
    (org_id = public.user_org_id() AND public.is_org_admin(org_id))
    OR public.is_soth_admin()
  );

-- --- Captures ---
-- SELECT: own org or soth_admin
CREATE POLICY "captures_select_own_or_admin" ON captures
  FOR SELECT USING (
    org_id = public.user_org_id()
    OR public.is_soth_admin()
  );
-- INSERT/UPDATE/DELETE: own org or soth_admin
CREATE POLICY "captures_manage" ON captures
  FOR ALL USING (
    org_id = public.user_org_id()
    OR public.is_soth_admin()
  );

-- --- Audit log ---
-- SELECT: soth_admin only
CREATE POLICY "audit_log_select_admin" ON audit_log
  FOR SELECT USING (public.is_soth_admin());
-- INSERT: any authenticated (system insert)
CREATE POLICY "audit_log_insert_auth" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- --- Journey stages ---
-- Public SELECT
CREATE POLICY "journey_stages_select_public" ON journey_stages
  FOR SELECT USING (true);
-- Admin INSERT/UPDATE/DELETE
CREATE POLICY "journey_stages_admin_all" ON journey_stages
  FOR ALL USING (public.is_soth_admin());
