CREATE TABLE IF NOT EXISTS "leaderboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"metric" text NOT NULL,
	"window_kind" text DEFAULT 'season' NOT NULL,
	"sport_code" text NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ranked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"division_id" uuid,
	"team_id" uuid NOT NULL,
	"gp" smallint DEFAULT 0 NOT NULL,
	"w" smallint DEFAULT 0 NOT NULL,
	"l" smallint DEFAULT 0 NOT NULL,
	"t" smallint DEFAULT 0 NOT NULL,
	"otl" smallint DEFAULT 0 NOT NULL,
	"points" smallint DEFAULT 0 NOT NULL,
	"gf" smallint DEFAULT 0 NOT NULL,
	"ga" smallint DEFAULT 0 NOT NULL,
	"gd" smallint DEFAULT 0 NOT NULL,
	"rank" smallint,
	"tiebreakers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"derived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stat_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"sport_code" text NOT NULL,
	"season_id" uuid,
	"league_id" uuid,
	"division_id" uuid,
	"gp_increment" smallint DEFAULT 1 NOT NULL,
	"minutes_played" integer,
	"core" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extended" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"derived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "standings" ADD CONSTRAINT "standings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "standings" ADD CONSTRAINT "standings_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_sport_code_sports_code_fk" FOREIGN KEY ("sport_code") REFERENCES "public"."sports"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leaderboard_uniq" ON "leaderboards" USING btree ("scope_type","scope_id","metric","window_kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_scope_idx" ON "leaderboards" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "standings_uniq" ON "standings" USING btree ("league_id","division_id","team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "standings_league_idx" ON "standings" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "standings_division_rank_idx" ON "standings" USING btree ("division_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stat_line_game_person_uniq" ON "stat_lines" USING btree ("game_id","person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stat_line_person_idx" ON "stat_lines" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stat_line_league_idx" ON "stat_lines" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stat_line_season_idx" ON "stat_lines" USING btree ("season_id");