-- SoTH — Add missing unique constraints for seed ON CONFLICT support
ALTER TABLE themes ADD CONSTRAINT themes_name_key UNIQUE (name);
ALTER TABLE sub_parameters ADD CONSTRAINT sub_parameters_theme_name_key UNIQUE (theme_id, name);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
UPDATE profiles SET email = 'tanmay.mukherji@rainmatter.org' WHERE id = '99713565-7091-4c57-93cc-a99e81d1652f';
