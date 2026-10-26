-- Rollback for 0071_bracket_atomic_writes.sql. Never applied automatically.
-- Deploy the earlier scheduler-bracket-generate / -advance first; they do
-- not call these functions.
DROP FUNCTION IF EXISTS public.sp_bracket_advance(uuid, timestamptz, jsonb, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.sp_bracket_create(jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.sp_bracket_insert_games(jsonb, jsonb);
