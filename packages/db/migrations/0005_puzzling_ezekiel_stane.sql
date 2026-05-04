CREATE TABLE IF NOT EXISTS "roster_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"move_type" text NOT NULL,
	"membership_type" text DEFAULT 'primary' NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"jersey_number" smallint,
	"position_code" text,
	"reason" text,
	"source_event_id" text,
	"created_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_move_type_check" CHECK ("roster_moves"."move_type" IN ('add','drop','trade_in','trade_out','call_up','send_down','release','reinstate')),
	CONSTRAINT "roster_membership_type_check" CHECK ("roster_moves"."membership_type" IN ('primary','play_up','affiliate','call_up'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"membership_type" text DEFAULT 'primary' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"jersey_number" smallint,
	"position_code" text,
	"current_status" text DEFAULT 'active' NOT NULL,
	"last_move_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_membership_status_check" CHECK ("team_memberships"."current_status" IN ('active','released','suspended','ineligible')),
	CONSTRAINT "team_membership_type_check" CHECK ("team_memberships"."membership_type" IN ('primary','play_up','affiliate','call_up'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_moves" ADD CONSTRAINT "roster_moves_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_moves" ADD CONSTRAINT "roster_moves_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_moves" ADD CONSTRAINT "roster_moves_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roster_moves" ADD CONSTRAINT "roster_moves_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_last_move_id_roster_moves_id_fk" FOREIGN KEY ("last_move_id") REFERENCES "public"."roster_moves"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_move_team_season_idx" ON "roster_moves" USING btree ("team_id","season_id","effective_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roster_move_person_season_idx" ON "roster_moves" USING btree ("person_id","season_id","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roster_move_source_event_uniq" ON "roster_moves" USING btree ("source_event_id") WHERE "roster_moves"."source_event_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_membership_active_uniq" ON "team_memberships" USING btree ("team_id","person_id","season_id") WHERE "team_memberships"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_membership_team_season_idx" ON "team_memberships" USING btree ("team_id","season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_membership_person_season_idx" ON "team_memberships" USING btree ("person_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_membership_jersey_uniq" ON "team_memberships" USING btree ("team_id","season_id","jersey_number") WHERE "team_memberships"."effective_to" IS NULL AND "team_memberships"."jersey_number" IS NOT NULL;