-- Add auth_id to local_users for Supabase Auth session linking
ALTER TABLE local_users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE DEFAULT NULL;
