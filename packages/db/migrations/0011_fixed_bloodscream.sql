CREATE TABLE IF NOT EXISTS "game_officials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text NOT NULL,
	"slot" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"assigned_by_user_id" uuid,
	"notes" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_official_status_check" CHECK ("game_officials"."status" IN ('confirmed','tentative','declined'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_officials" ADD CONSTRAINT "game_officials_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_officials" ADD CONSTRAINT "game_officials_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_officials" ADD CONSTRAINT "game_officials_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_official_game_idx" ON "game_officials" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_official_person_idx" ON "game_officials" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game_official_active_uniq" ON "game_officials" USING btree ("game_id","role","slot","person_id") WHERE "game_officials"."revoked_at" IS NULL;