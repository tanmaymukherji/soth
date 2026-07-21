-- SoTH — Add missing unique constraints for seed ON CONFLICT support
ALTER TABLE themes ADD CONSTRAINT themes_name_key UNIQUE (name);
ALTER TABLE sub_parameters ADD CONSTRAINT sub_parameters_theme_name_key UNIQUE (theme_id, name);
