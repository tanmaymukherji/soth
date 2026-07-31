-- Remove unused columns: themes.swaraj_tag, sub_parameters.ecosystem, proposed_sub_parameters.ecosystem
ALTER TABLE themes DROP COLUMN IF EXISTS swaraj_tag;
ALTER TABLE sub_parameters DROP COLUMN IF EXISTS ecosystem;
ALTER TABLE proposed_sub_parameters DROP COLUMN IF EXISTS ecosystem;
