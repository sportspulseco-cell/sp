CREATE TABLE IF NOT EXISTS "age_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"governing_body_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"birth_year_min" integer,
	"birth_year_max" integer,
	"gender_eligibility" text NOT NULL,
	"play_up_policy" jsonb DEFAULT '{"allowed":false}'::jsonb NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "age_group_gender_check" CHECK ("age_groups"."gender_eligibility" IN ('male','female','mixed','open'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "division_team_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"entry_status" text DEFAULT 'applied' NOT NULL,
	"seed_hint" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dte_entry_status_check" CHECK ("division_team_entries"."entry_status" IN ('applied','accepted','withdrawn','disqualified'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"age_group_id" uuid,
	"name" text NOT NULL,
	"tier" text,
	"gender_eligibility" text DEFAULT 'open' NOT NULL,
	"rule_set_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_teams" smallint,
	"playoff_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "division_gender_check" CHECK ("divisions"."gender_eligibility" IN ('male','female','mixed','open')),
	CONSTRAINT "division_status_check" CHECK ("divisions"."status" IN ('active','archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governing_bodies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sport_code" text NOT NULL,
	"country_code" char(2),
	"scope" text NOT NULL,
	"parent_id" uuid,
	"rules_url" text,
	"contact_email" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governing_bodies_code_unique" UNIQUE("code"),
	CONSTRAINT "gb_scope_check" CHECK ("governing_bodies"."scope" IN ('international','national','regional','state','local'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"sport_code" text NOT NULL,
	"governing_body_id" uuid,
	"rule_set_id" uuid,
	"name" text NOT NULL,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"format" text DEFAULT 'regular' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_format_check" CHECK ("leagues"."format" IN ('regular','tournament','pickup','friendly')),
	CONSTRAINT "league_status_check" CHECK ("leagues"."status" IN ('draft','registration_open','in_progress','playoffs','completed','archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_code" text NOT NULL,
	"governing_body_id" uuid,
	"org_id" uuid,
	"name" text NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_locked" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sport_code" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"registration_opens_at" timestamp with time zone,
	"registration_closes_at" timestamp with time zone,
	"roster_lock_at" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "season_status_check" CHECK ("seasons"."status" IN ('draft','registration_open','in_progress','playoffs','completed','archived')),
	CONSTRAINT "season_dates_check" CHECK ("seasons"."end_date" >= "seasons"."start_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"colors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logo_url" text,
	"sport_code" text NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_status_check" CHECK ("teams"."status" IN ('active','dissolved'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "age_groups" ADD CONSTRAINT "age_groups_governing_body_id_governing_bodies_id_fk" FOREIGN KEY ("governing_body_id") REFERENCES "public"."governing_bodies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "division_team_entries" ADD CONSTRAINT "division_team_entries_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "division_team_entries" ADD CONSTRAINT "division_team_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "divisions" ADD CONSTRAINT "divisions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "divisions" ADD CONSTRAINT "divisions_age_group_id_age_groups_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governing_bodies" ADD CONSTRAINT "governing_bodies_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governing_bodies" ADD CONSTRAINT "governing_bodies_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leagues" ADD CONSTRAINT "leagues_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leagues" ADD CONSTRAINT "leagues_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leagues" ADD CONSTRAINT "leagues_governing_body_id_governing_bodies_id_fk" FOREIGN KEY ("governing_body_id") REFERENCES "public"."governing_bodies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leagues" ADD CONSTRAINT "leagues_rule_set_id_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."rule_sets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_governing_body_id_governing_bodies_id_fk" FOREIGN KEY ("governing_body_id") REFERENCES "public"."governing_bodies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "age_group_gb_code_uniq" ON "age_groups" USING btree ("governing_body_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "age_group_gb_idx" ON "age_groups" USING btree ("governing_body_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dte_division_team_uniq" ON "division_team_entries" USING btree ("division_id","team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dte_division_idx" ON "division_team_entries" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dte_team_idx" ON "division_team_entries" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "division_league_idx" ON "divisions" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "division_age_group_idx" ON "divisions" USING btree ("age_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gb_sport_idx" ON "governing_bodies" USING btree ("sport_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gb_parent_idx" ON "governing_bodies" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "league_season_idx" ON "leagues" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "league_sport_idx" ON "leagues" USING btree ("sport_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "league_status_idx" ON "leagues" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_set_sport_idx" ON "rule_sets" USING btree ("sport_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_set_gb_idx" ON "rule_sets" USING btree ("governing_body_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_set_org_idx" ON "rule_sets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_org_idx" ON "seasons" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_sport_idx" ON "seasons" USING btree ("sport_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "season_status_idx" ON "seasons" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_org_idx" ON "teams" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_sport_idx" ON "teams" USING btree ("sport_code");