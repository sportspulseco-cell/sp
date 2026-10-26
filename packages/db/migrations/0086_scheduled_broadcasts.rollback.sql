-- Rollback for 0086_scheduled_broadcasts.sql. Never applied automatically.
--
-- Refuses while any announcement is still waiting to go out or any
-- attachment row exists: dropping them would silently cancel announcements
-- and orphan files in the broadcast-attachments bucket. Cancel / export
-- them and empty the bucket first. Roll back 0087 (the cron) before this.

DO $$ BEGIN
  IF to_regclass('public.scheduled_broadcasts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.scheduled_broadcasts WHERE status IN ('scheduled','sending')) THEN
      RAISE EXCEPTION 'scheduled_broadcasts has announcements waiting; cancel them before rolling back 0086';
    END IF;
  END IF;
  IF to_regclass('public.broadcast_attachments') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.broadcast_attachments) THEN
      RAISE EXCEPTION 'broadcast_attachments has rows; remove the files and rows before rolling back 0086';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.scheduled_broadcasts;
DROP TABLE IF EXISTS public.broadcast_attachments;
