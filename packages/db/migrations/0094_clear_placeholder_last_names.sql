-- 0094: a person whose last name was never given carries an empty last name,
-- not a placeholder. Older account code stored "—" (and a mis-encoded "â€”"),
-- which showed as junk on People and Registrations (PPHL, 24 Oct item 7).
-- The API now stores "" in that case. Data only; safe to run twice.
UPDATE "persons" SET "legal_last_name" = '', "updated_at" = now()
WHERE "legal_last_name" IN ('—', 'â€”', 'â€—');
