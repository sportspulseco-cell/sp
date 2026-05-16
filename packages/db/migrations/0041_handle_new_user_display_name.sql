-- BUG-009 — when an admin invites a user with a display_name, the
-- value lands in auth.users.raw_user_meta_data.display_name but the
-- trigger that auto-creates the profile row was ignoring it.
-- Profiles ended up with display_name = NULL, so the /users list
-- couldn't show the name the admin typed.
--
-- Extend the trigger to copy display_name through. Also handles
-- legal_first_name / legal_last_name for symmetry with the
-- self-registration funnel which already writes those.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    legal_first_name,
    legal_last_name
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(meta->>'display_name', ''),
    NULLIF(meta->>'legal_first_name', ''),
    NULLIF(meta->>'legal_last_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
