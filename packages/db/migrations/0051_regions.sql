-- Regions: a structural tier between a season and its divisions
-- (PPHL review 23-24 Oct 2026: Org -> Season -> Region -> Division -> Team).
-- A region (Massachusetts, New Hampshire) belongs to one org and is reused
-- across seasons; each division may point at one. Additive and nullable,
-- so every existing division and screen keeps working with region unset.
--
-- Rollback: 0051_regions.rollback.sql.

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT region_status_check CHECK (status IN ('active', 'archived'))
);

-- One region name per org, case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS region_org_name_uniq
  ON regions (org_id, lower(name));
CREATE INDEX IF NOT EXISTS region_org_idx ON regions (org_id);

ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS division_region_idx ON divisions (region_id);

-- Lock down like the rest of the schema (0050).
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON regions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON regions FROM authenticated;
