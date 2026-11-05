ALTER TABLE public.substitute_broadcasts
  ADD COLUMN IF NOT EXISTS review_sequence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS log jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.substitute_broadcasts
  ADD CONSTRAINT substitute_broadcasts_review_note_check CHECK (review_note IS NULL OR length(review_note)<=500),
  ADD CONSTRAINT substitute_broadcasts_review_sequence_check CHECK (review_sequence>=0),
  ADD CONSTRAINT substitute_broadcasts_log_check CHECK (jsonb_typeof(log)='array');
ALTER TABLE public.substitute_broadcast_recipients DROP CONSTRAINT substitute_broadcast_recipients_status_check;
ALTER TABLE public.substitute_broadcast_recipients ADD CONSTRAINT substitute_broadcast_recipients_status_check
  CHECK (status IN ('invited','accepted','declined','closed','withdrawn'));
