-- Restrict local_users from the public Data API.
-- All user management goes through the soth-auth Edge Function, which uses
-- the service role and validates Supabase Auth sessions before role checks.

DROP POLICY IF EXISTS "local_users_insert_public" ON public.local_users;
DROP POLICY IF EXISTS "local_users_select_public" ON public.local_users;
