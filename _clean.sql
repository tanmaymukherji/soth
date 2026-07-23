-- Delete old org_villages (no captures) where a CSV village exists in same district
DELETE FROM org_villages ov
USING villages old_v, villages new_v
WHERE ov.village_id = old_v.id
  AND old_v.geocode_status = 'unmatched'
  AND new_v.geocode_source = 'csv-upload'
  AND new_v.lat IS NOT NULL
  AND LOWER(old_v.district) = LOWER(new_v.district)
  AND LOWER(old_v.state) = LOWER(new_v.state)
  AND old_v.id != new_v.id
  AND NOT EXISTS (SELECT 1 FROM captures c WHERE c.village_id = old_v.id);

-- Delete old unmatched villages that have no captures and a CSV village exists in same district
DELETE FROM villages old_v
WHERE old_v.geocode_status = 'unmatched'
  AND EXISTS (SELECT 1 FROM villages new_v 
    WHERE new_v.geocode_source = 'csv-upload' 
    AND new_v.lat IS NOT NULL
    AND LOWER(old_v.district) = LOWER(new_v.district) 
    AND LOWER(old_v.state) = LOWER(new_v.state)
    AND old_v.id != new_v.id)
  AND NOT EXISTS (SELECT 1 FROM captures c WHERE c.village_id = old_v.id);