-- auth schema and auth.users are managed by Supabase Auth — declared in schema/auth.ts
-- only as a FK reference target, never created or modified by our migrations.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "countries" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_currency" char(3) NOT NULL,
	"default_locale" text NOT NULL,
	"phone_prefix" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"decimals" smallint DEFAULT 2 NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locales" (
	"code" text PRIMARY KEY NOT NULL,
	"rtl" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sports" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"team_size_default" smallint,
	"period_model" text NOT NULL,
	"scoring_model" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_period_model_check" CHECK ("sports"."period_model" IN ('period','half','quarter','inning','set','frame','none'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cross_org_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_org_id" uuid NOT NULL,
	"to_org_id" uuid NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cog_not_self" CHECK ("cross_org_grants"."from_org_id" <> "cross_org_grants"."to_org_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "family_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"minor_person_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"legal_status" text,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"unlinked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_links_relationship_check" CHECK ("family_links"."relationship" IN ('parent','guardian','relative'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_org_id" uuid NOT NULL,
	"child_org_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_relations_relation_check" CHECK ("org_relations"."relation" IN ('sanctions','member_of','owns')),
	CONSTRAINT "org_relations_not_self" CHECK ("org_relations"."parent_org_id" <> "org_relations"."child_org_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"org_type" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"default_locale" text NOT NULL,
	"default_currency" char(3) NOT NULL,
	"default_timezone" text DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "orgs_org_type_check" CHECK ("orgs"."org_type" IN ('governing_body','federation','league_operator','club','association','school','tournament_operator')),
	CONSTRAINT "orgs_status_check" CHECK ("orgs"."status" IN ('active','suspended','archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"legal_first_name" text NOT NULL,
	"legal_last_name" text NOT NULL,
	"preferred_name" text,
	"dob_date" date,
	"gender_self_id" text,
	"pronouns" text,
	"country_code" char(2),
	"photo_url" text,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persons_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext",
	"phone_e164" text,
	"legal_first_name" text,
	"legal_last_name" text,
	"preferred_name" text,
	"display_name" text,
	"photo_url" text,
	"dob_date" date,
	"gender_self_id" text,
	"pronouns" text,
	"country_code" char(2),
	"locale" text DEFAULT 'en-US' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email"),
	CONSTRAINT "profiles_phone_e164_unique" UNIQUE("phone_e164"),
	CONSTRAINT "profiles_status_check" CHECK ("profiles"."status" IN ('pending','active','suspended','deleted'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"granted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ura_scope_type_check" CHECK ("user_role_assignments"."scope_type" IN ('platform','org','league','season','division','team','game'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"org_id" uuid,
	"actor_user_id" uuid,
	"on_behalf_of_user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip_addr" "inet",
	"user_agent" text,
	"request_id" text,
	"retention_class" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_retention_check" CHECK ("audit_events"."retention_class" IN ('default','financial','legal_hold'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countries" ADD CONSTRAINT "countries_default_currency_currencies_code_fk" FOREIGN KEY ("default_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countries" ADD CONSTRAINT "countries_default_locale_locales_code_fk" FOREIGN KEY ("default_locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_org_grants" ADD CONSTRAINT "cross_org_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_org_grants" ADD CONSTRAINT "cross_org_grants_from_org_id_orgs_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_org_grants" ADD CONSTRAINT "cross_org_grants_to_org_id_orgs_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_org_grants" ADD CONSTRAINT "cross_org_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_links" ADD CONSTRAINT "family_links_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_links" ADD CONSTRAINT "family_links_minor_person_id_persons_id_fk" FOREIGN KEY ("minor_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "family_links" ADD CONSTRAINT "family_links_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_relations" ADD CONSTRAINT "org_relations_parent_org_id_orgs_id_fk" FOREIGN KEY ("parent_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_relations" ADD CONSTRAINT "org_relations_child_org_id_orgs_id_fk" FOREIGN KEY ("child_org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orgs" ADD CONSTRAINT "orgs_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orgs" ADD CONSTRAINT "orgs_default_locale_locales_code_fk" FOREIGN KEY ("default_locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orgs" ADD CONSTRAINT "orgs_default_currency_currencies_code_fk" FOREIGN KEY ("default_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_on_behalf_of_user_id_users_id_fk" FOREIGN KEY ("on_behalf_of_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cog_user_idx" ON "cross_org_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cog_to_org_idx" ON "cross_org_grants" USING btree ("to_org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_links_guardian_idx" ON "family_links" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_links_minor_idx" ON "family_links" USING btree ("minor_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "family_links_uniq" ON "family_links" USING btree ("guardian_user_id","minor_person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_relations_parent_idx" ON "org_relations" USING btree ("parent_org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_relations_child_idx" ON "org_relations" USING btree ("child_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_relations_uniq_edge" ON "org_relations" USING btree ("parent_org_id","child_org_id","relation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orgs_country_idx" ON "orgs" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orgs_status_idx" ON "orgs" USING btree ("status") WHERE "orgs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orgs_org_type_idx" ON "orgs" USING btree ("org_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "persons_user_idx" ON "persons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "persons_country_idx" ON "persons" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_status_idx" ON "profiles" USING btree ("status") WHERE "profiles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_country_idx" ON "profiles" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roles_org_idx" ON "roles" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_org_code_uniq" ON "roles" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ura_user_idx" ON "user_role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ura_role_idx" ON "user_role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ura_scope_idx" ON "user_role_assignments" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ura_user_active_idx" ON "user_role_assignments" USING btree ("user_id") WHERE "user_role_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_org_ts_idx" ON "audit_events" USING btree ("org_id","ts_utc" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_actor_ts_idx" ON "audit_events" USING btree ("actor_user_id","ts_utc" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_action_ts_idx" ON "audit_events" USING btree ("action","ts_utc" DESC NULLS LAST);