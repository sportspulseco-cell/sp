-- Rollback for 0051_regions.sql. Drops the region tier. Division rows keep
-- every other column; only region_id (nullable) is removed.
DROP INDEX IF EXISTS division_region_idx;
ALTER TABLE divisions DROP COLUMN IF EXISTS region_id;
DROP TABLE IF EXISTS regions;
