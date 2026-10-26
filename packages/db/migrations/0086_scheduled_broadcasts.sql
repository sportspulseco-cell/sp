-- 0086_scheduled_broadcasts.sql
-- UC-19 announcement compose: schedule for later and attachments.
--
-- * scheduled_broadcasts: a composed announcement waiting for send_at.
--   The API job /org-admin/broadcast/cron/due (pg_cron in 0087) claims due
--   rows (scheduled -> sending), re-checks the sender's reach, resolves
--   the audience at send time and queues the notifications (idempotent on
--   the composer key). Cancellable while status = 'scheduled'.
-- * broadcast_attachments: files in the PRIVATE storage bucket
--   broadcast-attachments (created by the API on first upload). Bodies
--   link to an API URL signed per recipient that redirects to a 5-minute
--   storage signed URL.
-- * RLS on, no policies, anon and authenticated hold nothing; the API
--   connects as postgres. Same stance as 0050 / 0054.
--
-- Drafted with drizzle-kit generate --name=scheduled_broadcasts; reviewed.
-- Additive and idempotent. Rollback: 0086_scheduled_broadcasts.rollback.sql.
-- Drizzle: packages/db/src/schema/notifications.ts.

CREATE TABLE IF NOT EXISTS "broadcast_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"broadcast_key" uuid,
	"storage_bucket" text DEFAULT 'broadcast-attachments' NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bc_att_content_type_check" CHECK ("broadcast_attachments"."content_type" IN ('application/pdf','image/png','image/jpeg','image/webp')),
	CONSTRAINT "bc_att_size_check" CHECK ("broadcast_attachments"."size_bytes" > 0 AND "broadcast_attachments"."size_bytes" <= 3145728),
	CONSTRAINT "bc_att_sha256_check" CHECK ("broadcast_attachments"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "bc_att_file_name_check" CHECK (char_length("broadcast_attachments"."file_name") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_by_user_id" uuid,
	"send_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb,
	"last_error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sched_bc_status_check" CHECK ("scheduled_broadcasts"."status" IN ('scheduled','sending','sent','cancelled','failed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broadcast_attachments" ADD CONSTRAINT "broadcast_attachments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broadcast_attachments" ADD CONSTRAINT "broadcast_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bc_att_path_uniq" ON "broadcast_attachments" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bc_att_key_idx" ON "broadcast_attachments" USING btree ("broadcast_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bc_att_org_idx" ON "broadcast_attachments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sched_bc_key_uniq" ON "scheduled_broadcasts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sched_bc_due_idx" ON "scheduled_broadcasts" USING btree ("status","send_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sched_bc_org_idx" ON "scheduled_broadcasts" USING btree ("org_id","send_at");

--> statement-breakpoint
ALTER TABLE public.scheduled_broadcasts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.broadcast_attachments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.scheduled_broadcasts FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON public.broadcast_attachments FROM anon, authenticated;
