-- Allow sub_parameters to support both qualitative AND quantitative capture
ALTER TABLE sub_parameters DROP CONSTRAINT IF EXISTS sub_parameters_data_type_check;
ALTER TABLE sub_parameters ADD CONSTRAINT sub_parameters_data_type_check
  CHECK (data_type IN ('qualitative','quantitative_scale','quantitative_numeric','text','both'));
