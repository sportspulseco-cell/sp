-- Close the Supabase Data API (PostgREST) over the public schema.
--
-- Found 24 Oct 2026: every public table had RLS off and the anon role
-- held SELECT/INSERT on all of them. Anyone with the public anon key
-- (shipped in every web app) could list profiles, persons (names, dates
-- of birth, minors included) and invoices over /rest/v1, and call the
-- SECURITY DEFINER sweeps over /rest/v1/rpc as postgres.
--
-- Nothing in the product needs that path: the API connects as postgres
-- and edge functions use service_role (both bypass RLS); realtime uses
-- broadcast channels only. The one direct read is the superadmin layout
-- loading the signed-in user's own profile, kept by a policy below.
--
-- Idempotent. Rollback: 0050_lock_down_data_api.rollback.sql.

-- 1. RLS on every public table. No policy = no rows for anon/authenticated.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 2. anon gets nothing; authenticated may only read (RLS still applies).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- 3. SECURITY DEFINER functions are not callable over /rpc. Trigger
-- functions are skipped (privileges are not checked when they fire).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 4. Signed-in users can read their own profile (superadmin layout).
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
