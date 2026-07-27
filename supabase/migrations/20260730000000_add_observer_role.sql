-- Add 'observer' role to local_users
ALTER TABLE local_users DROP CONSTRAINT IF EXISTS local_users_role_check;
ALTER TABLE local_users ADD CONSTRAINT local_users_role_check
  CHECK (role IN ('observer', 'partner', 'partner_admin', 'soth_admin'));
