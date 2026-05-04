CREATE TABLE IF NOT EXISTS "background_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_ref" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"adjudication" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bgcheck_status_check" CHECK ("background_checks"."status" IN ('requested','in_progress','clear','flagged','adverse','expired'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consent_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_addr" "inet",
	"user_agent" text,
	"signed_by_user_id" uuid,
	"geolocation" jsonb,
	"signature_blob_url" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_html" text NOT NULL,
	"content_hash" text NOT NULL,
	"language_code" text DEFAULT 'en-US' NOT NULL,
	"jurisdiction_country_code" char(2),
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_kind_check" CHECK ("documents"."kind" IN ('waiver','consent','code_of_conduct','privacy','parental','media_release','injury_policy','custom'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eligibility_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"season_id" uuid,
	"governing_body_id" uuid,
	"rule_evaluation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"waiver_reason" text,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eligibility_status_check" CHECK ("eligibility_records"."status" IN ('pending','eligible','ineligible','expired','waived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"governing_body_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"source" text DEFAULT 'self_attest' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "id_verify_status_check" CHECK ("identity_verifications"."status" IN ('pending','verified','mismatch','expired')),
	CONSTRAINT "id_verify_source_check" CHECK ("identity_verifications"."source" IN ('api','document_upload','self_attest'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registration_form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registration_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"scope_id" uuid,
	"name" text NOT NULL,
	"name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"active_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_scope_check" CHECK ("registration_forms"."scope" IN ('org','league','division'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registration_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"org_id" uuid NOT NULL,
	"form_version_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"subject_person_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"league_id" uuid,
	"division_id" uuid,
	"team_id" uuid,
	"submitted_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "registration_status_check" CHECK ("registrations"."status" IN ('draft','submitted','under_review','approved','rejected','waitlisted','withdrawn'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "background_checks" ADD CONSTRAINT "background_checks_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consent_signatures" ADD CONSTRAINT "consent_signatures_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consent_signatures" ADD CONSTRAINT "consent_signatures_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consent_signatures" ADD CONSTRAINT "consent_signatures_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_jurisdiction_country_code_countries_code_fk" FOREIGN KEY ("jurisdiction_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eligibility_records" ADD CONSTRAINT "eligibility_records_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eligibility_records" ADD CONSTRAINT "eligibility_records_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eligibility_records" ADD CONSTRAINT "eligibility_records_governing_body_id_governing_bodies_id_fk" FOREIGN KEY ("governing_body_id") REFERENCES "public"."governing_bodies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eligibility_records" ADD CONSTRAINT "eligibility_records_evaluated_by_user_id_users_id_fk" FOREIGN KEY ("evaluated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_governing_body_id_governing_bodies_id_fk" FOREIGN KEY ("governing_body_id") REFERENCES "public"."governing_bodies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registration_form_versions" ADD CONSTRAINT "registration_form_versions_form_id_registration_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."registration_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registration_forms" ADD CONSTRAINT "registration_forms_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registration_items" ADD CONSTRAINT "registration_items_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_form_version_id_registration_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."registration_form_versions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_subject_person_id_persons_id_fk" FOREIGN KEY ("subject_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bgcheck_person_idx" ON "background_checks" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bgcheck_status_idx" ON "background_checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_person_idx" ON "consent_signatures" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_version_idx" ON "consent_signatures" USING btree ("document_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consent_uniq" ON "consent_signatures" USING btree ("person_id","document_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_version_uniq" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_version_doc_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_org_idx" ON "documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_kind_idx" ON "documents" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_person_idx" ON "eligibility_records" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_season_idx" ON "eligibility_records" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_status_idx" ON "eligibility_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "id_verify_person_idx" ON "identity_verifications" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "id_verify_uniq" ON "identity_verifications" USING btree ("person_id","governing_body_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "form_version_uniq" ON "registration_form_versions" USING btree ("form_id","version_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_version_form_idx" ON "registration_form_versions" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_org_idx" ON "registration_forms" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_scope_idx" ON "registration_forms" USING btree ("scope","scope_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reg_item_reg_idx" ON "registration_items" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reg_item_uniq" ON "registration_items" USING btree ("registration_id","field_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_org_idx" ON "registrations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_status_idx" ON "registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_subject_idx" ON "registrations" USING btree ("subject_person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_league_idx" ON "registrations" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_division_idx" ON "registrations" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_team_idx" ON "registrations" USING btree ("team_id");