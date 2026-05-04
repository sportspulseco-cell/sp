-- =====================================================================
-- 0000_init — extensions and shared helpers
-- Hand-written. Runs BEFORE Drizzle-generated table migrations.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_graphql;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at()
  IS 'Generic trigger to maintain updated_at timestamps';
--> statement-breakpoint

-- These run after the table migrations land. They are wrapped in DO blocks
-- so dependent objects (profiles, etc.) need not exist when this file is
-- first parsed. Drizzle re-runs migrations idempotently.
