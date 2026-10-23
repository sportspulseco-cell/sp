-- Add notifications.read_at, which the Drizzle schema
-- (src/schema/notifications.ts) has declared for a while but no
-- migration ever created. Every notification insert/select that names
-- the column fails on databases built from migrations alone (found on
-- staging 2026-10-23: broadcasts queued 0 rows, captain "Remind all"
-- returned 500, player /notifications always empty).
--
-- NULL = unread. Additive + idempotent per the CLAUDE.md migration rules.
-- Do NOT auto-apply to production from CI; apply manually after
-- explicit confirmation.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz;
