-- Rollback 0094: the cleared names held no information, so empty last names
-- go back to the old "—" placeholder.
UPDATE "persons" SET "legal_last_name" = '—', "updated_at" = now() WHERE "legal_last_name" = '';
