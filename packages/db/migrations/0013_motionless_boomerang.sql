CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"registration_type_filter" text DEFAULT 'all' NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"attachment_path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_tpl_event_check" CHECK ("email_templates"."event_type" IN ('on_payment','on_approved','on_rejected','installment_reminder','season_closing','parental_consent','custom')),
	CONSTRAINT "email_tpl_type_filter_check" CHECK ("email_templates"."registration_type_filter" IN ('all','team','individual'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "free_agent_pool_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_person_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"positions" text[] NOT NULL,
	"availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"level_primary" text NOT NULL,
	"level_flexibility" text[],
	"note" text,
	"no_show_rate" text,
	"status" text DEFAULT 'active' NOT NULL,
	"placed_team_id" uuid,
	"placed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fa_pool_status_check" CHECK ("free_agent_pool_entries"."status" IN ('active','placed','withdrawn')),
	CONSTRAINT "fa_pool_level_check" CHECK ("free_agent_pool_entries"."level_primary" IN ('A','B','C','D'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "installment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"stripe_payment_intent_id" text,
	"last_error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"charged_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installment_status_check" CHECK ("installment_schedules"."status" IN ('scheduled','charging','succeeded','failed','refunded','cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"division_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	"full_price_cents" integer NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"payment_plan_enabled" boolean DEFAULT false NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"installment_count" integer DEFAULT 0 NOT NULL,
	"installment_interval_days" integer DEFAULT 30 NOT NULL,
	"late_fee_cents" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"custom_url_slug" text,
	"is_returning_team_pricing" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_tier_full_price_check" CHECK ("pricing_tiers"."full_price_cents" >= 0),
	CONSTRAINT "pricing_tier_deposit_check" CHECK ("pricing_tiers"."deposit_cents" >= 0 AND "pricing_tiers"."deposit_cents" <= "pricing_tiers"."full_price_cents"),
	CONSTRAINT "pricing_tier_installment_check" CHECK ("pricing_tiers"."installment_count" >= 0),
	CONSTRAINT "pricing_tier_usage_check" CHECK ("pricing_tiers"."usage_limit" IS NULL OR "pricing_tiers"."usage_count" <= "pricing_tiers"."usage_limit")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"issued_by_user_id" uuid,
	"invitee_email" text,
	"token" text NOT NULL,
	"kind" text DEFAULT 'personal' NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"send_count" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invites_token_unique" UNIQUE("token"),
	CONSTRAINT "team_invite_kind_check" CHECK ("team_invites"."kind" IN ('personal','generic')),
	CONSTRAINT "team_invite_status_check" CHECK ("team_invites"."status" IN ('pending','accepted','declined','expired','revoked'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "free_agent_pool_entries" ADD CONSTRAINT "free_agent_pool_entries_player_person_id_persons_id_fk" FOREIGN KEY ("player_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "free_agent_pool_entries" ADD CONSTRAINT "free_agent_pool_entries_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "free_agent_pool_entries" ADD CONSTRAINT "free_agent_pool_entries_placed_team_id_teams_id_fk" FOREIGN KEY ("placed_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installment_schedules" ADD CONSTRAINT "installment_schedules_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_tpl_season_idx" ON "email_templates" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_tpl_active_uniq" ON "email_templates" USING btree ("season_id","event_type","registration_type_filter") WHERE "email_templates"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fa_pool_season_idx" ON "free_agent_pool_entries" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fa_pool_player_idx" ON "free_agent_pool_entries" USING btree ("player_person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fa_pool_level_idx" ON "free_agent_pool_entries" USING btree ("level_primary");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fa_pool_uniq" ON "free_agent_pool_entries" USING btree ("player_person_id","season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installment_invoice_idx" ON "installment_schedules" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "installment_uniq" ON "installment_schedules" USING btree ("invoice_id","installment_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_tier_season_idx" ON "pricing_tiers" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_tier_division_idx" ON "pricing_tiers" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_tier_code_uniq" ON "pricing_tiers" USING btree ("season_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_tier_custom_url_uniq" ON "pricing_tiers" USING btree ("season_id","custom_url_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invite_team_idx" ON "team_invites" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invite_season_idx" ON "team_invites" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invite_email_idx" ON "team_invites" USING btree ("invitee_email");