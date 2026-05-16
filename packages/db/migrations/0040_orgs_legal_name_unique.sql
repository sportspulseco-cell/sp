-- BUG-007 — enforce orgs.legal_name uniqueness (case-insensitive,
-- active rows only). The test plan (TC-A2-02) asks for this; the UI
-- copy mentioning "Slug must be globally unique" wasn't symmetric on
-- legal_name. Partial index lets a soft-deleted row's legal_name be
-- re-used by a new active org.
--
-- Additive + idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS orgs_legal_name_lower_unique
  ON orgs (LOWER(legal_name))
  WHERE deleted_at IS NULL;
