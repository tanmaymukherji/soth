-- RLS policies for local_users table
-- Edge Function uses service key (bypasses RLS)
-- Frontend uses anon key — allow SELECT and INSERT; UPDATE/DELETE only via Edge Function

ALTER TABLE local_users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (signup) — Edge Function also handles this
CREATE POLICY "local_users_insert_public" ON local_users
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read (admin panel lists users)
CREATE POLICY "local_users_select_public" ON local_users
  FOR SELECT USING (true);

-- Only allow updates via Edge Function (service key bypasses RLS)
-- No anon-key UPDATE/DELETE allowed
