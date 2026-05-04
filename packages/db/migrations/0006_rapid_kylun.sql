CREATE TABLE IF NOT EXISTS "game_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"status" text DEFAULT 'present' NOT NULL,
	"jersey_number_used" smallint,
	"position_played" text,
	"minutes_played" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_status_check" CHECK ("game_attendance"."status" IN ('present','absent','late','sub','scratched'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"sport_code" text NOT NULL,
	"event_type" text NOT NULL,
	"ts_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"period" smallint,
	"clock_remaining_sec" integer,
	"team_id" uuid,
	"primary_person_id" uuid,
	"secondary_person_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'scorekeeper_app' NOT NULL,
	"source_device_id" text,
	"idempotency_key" text,
	"correction_of_event_id" uuid,
	"logged_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "game_event_source_check" CHECK ("game_events"."source" IN ('scorekeeper_app','ref_amend','video_review','import','system'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"division_id" uuid,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"sport_code" text NOT NULL,
	"scheduled_start_ts_utc" timestamp with time zone NOT NULL,
	"tz" text DEFAULT 'UTC' NOT NULL,
	"duration_min" smallint DEFAULT 60 NOT NULL,
	"venue_name" text,
	"surface_label" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"home_score" smallint DEFAULT 0 NOT NULL,
	"away_score" smallint DEFAULT 0 NOT NULL,
	"period" smallint DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" uuid,
	CONSTRAINT "game_status_check" CHECK ("games"."status" IN ('scheduled','in_play','completed','postponed','cancelled','forfeited')),
	CONSTRAINT "game_not_self" CHECK ("games"."home_team_id" <> "games"."away_team_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scoresheet_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"signer_user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_addr" "inet",
	"user_agent" text,
	"signature_blob_url" text,
	"digest_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoresheet_role_check" CHECK ("scoresheet_signatures"."role" IN ('home_coach','away_coach','head_ref','linesman','scorekeeper','timekeeper'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suspensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"source_event_id" uuid,
	"kind" text NOT NULL,
	"n_games" smallint,
	"n_days" smallint,
	"served_count" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" uuid,
	CONSTRAINT "suspension_kind_check" CHECK ("suspensions"."kind" IN ('n_games','n_days','indefinite','time_bounded')),
	CONSTRAINT "suspension_status_check" CHECK ("suspensions"."status" IN ('active','served','lifted','appealed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_attendance" ADD CONSTRAINT "game_attendance_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_attendance" ADD CONSTRAINT "game_attendance_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_attendance" ADD CONSTRAINT "game_attendance_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_events" ADD CONSTRAINT "game_events_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_events" ADD CONSTRAINT "game_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_events" ADD CONSTRAINT "game_events_primary_person_id_persons_id_fk" FOREIGN KEY ("primary_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_events" ADD CONSTRAINT "game_events_logged_by_user_id_users_id_fk" FOREIGN KEY ("logged_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_events" ADD CONSTRAINT "game_events_correction_fk" FOREIGN KEY ("correction_of_event_id") REFERENCES "public"."game_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scoresheet_signatures" ADD CONSTRAINT "scoresheet_signatures_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scoresheet_signatures" ADD CONSTRAINT "scoresheet_signatures_signer_user_id_users_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_source_event_id_game_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."game_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suspensions" ADD CONSTRAINT "suspensions_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_uniq" ON "game_attendance" USING btree ("game_id","person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_game_idx" ON "game_attendance" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_event_game_idx" ON "game_events" USING btree ("game_id","ts_utc");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_event_type_idx" ON "game_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_event_person_idx" ON "game_events" USING btree ("primary_person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_league_idx" ON "games" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_division_idx" ON "games" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_home_idx" ON "games" USING btree ("home_team_id","scheduled_start_ts_utc");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_away_idx" ON "games" USING btree ("away_team_id","scheduled_start_ts_utc");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_schedule_idx" ON "games" USING btree ("scheduled_start_ts_utc");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scoresheet_uniq" ON "scoresheet_signatures" USING btree ("game_id","signer_user_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scoresheet_game_idx" ON "scoresheet_signatures" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspension_person_idx" ON "suspensions" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suspension_source_idx" ON "suspensions" USING btree ("source_event_id");