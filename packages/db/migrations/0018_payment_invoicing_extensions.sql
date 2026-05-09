-- 0017_payment_invoicing_extensions.sql
--
-- Extension tables for the 6-tab Payment & Invoicing surface in
-- apps/superadmin-web/(admin)/payments. All net-new and additive —
-- existing finance tables (invoices, invoice_items, payments,
-- fee_schedules) are untouched.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every FK uses a
-- DO $$ ... EXCEPTION WHEN duplicate_object guard so the file can be
-- re-applied without erroring.
--
-- Tables:
--   - team_invoice_splits      → "Dues split" tab
--   - refunds                  → "Refund / credit" tab
--   - wallet_accounts          → "Wallet" balance card
--   - wallet_ledger            → "Wallet" entries list
--   - invoice_escalations      → "Overdue" queue row state
--   - overdue_reminder_log     → "Overdue" reminder counts + history
--   - quickbooks_sync_logs     → "QuickBooks sync status" footer

-- =====================================================================
-- TEAM_INVOICE_SPLITS
-- =====================================================================
CREATE TABLE IF NOT EXISTS "team_invoice_splits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL,
  "team_id" uuid NOT NULL,
  "player_person_id" uuid NOT NULL,
  "allocated_cents" integer NOT NULL,
  "collected_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_reminder_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "team_split_status_check" CHECK ("team_invoice_splits"."status" IN ('pending','partial','paid','overdue')),
  CONSTRAINT "team_split_alloc_check" CHECK ("team_invoice_splits"."allocated_cents" >= 0),
  CONSTRAINT "team_split_collected_check" CHECK ("team_invoice_splits"."collected_cents" >= 0 AND "team_invoice_splits"."collected_cents" <= "team_invoice_splits"."allocated_cents")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_invoice_splits" ADD CONSTRAINT "team_invoice_splits_invoice_id_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_invoice_splits" ADD CONSTRAINT "team_invoice_splits_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_invoice_splits" ADD CONSTRAINT "team_invoice_splits_player_person_id_persons_id_fk"
    FOREIGN KEY ("player_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_split_invoice_player_uniq" ON "team_invoice_splits" USING btree ("invoice_id","player_person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_split_invoice_idx" ON "team_invoice_splits" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_split_team_idx" ON "team_invoice_splits" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_split_player_idx" ON "team_invoice_splits" USING btree ("player_person_id");

-- =====================================================================
-- REFUNDS
-- =====================================================================
CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "payment_id" uuid,
  "refund_type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "reason" text NOT NULL,
  "issued_by_user_id" uuid,
  "processor_refund_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "processed_at" timestamp with time zone,
  "last_error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refund_type_check" CHECK ("refunds"."refund_type" IN ('full_original','partial_original','wallet_credit','adjustment')),
  CONSTRAINT "refund_status_check" CHECK ("refunds"."status" IN ('pending','succeeded','failed','cancelled')),
  CONSTRAINT "refund_amount_check" CHECK ("refunds"."amount_cents" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_org_id_orgs_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_id_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk"
    FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_issued_by_user_id_users_id_fk"
    FOREIGN KEY ("issued_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_invoice_idx" ON "refunds" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_payment_idx" ON "refunds" USING btree ("payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_org_status_idx" ON "refunds" USING btree ("org_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "refund_processor_uniq" ON "refunds" USING btree ("processor_refund_id");

-- =====================================================================
-- WALLET_ACCOUNTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS "wallet_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "balance_cents" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone,
  "frozen" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wallet_balance_check" CHECK ("wallet_accounts"."balance_cents" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_person_id_persons_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_org_id_orgs_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_person_org_currency_uniq" ON "wallet_accounts" USING btree ("person_id","org_id","currency");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_person_idx" ON "wallet_accounts" USING btree ("person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_org_idx" ON "wallet_accounts" USING btree ("org_id");

-- =====================================================================
-- WALLET_LEDGER
-- =====================================================================
CREATE TABLE IF NOT EXISTS "wallet_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wallet_id" uuid NOT NULL,
  "entry_type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "related_invoice_id" uuid,
  "related_refund_id" uuid,
  "reason" text NOT NULL,
  "issued_by_user_id" uuid,
  "expires_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wallet_ledger_type_check" CHECK ("wallet_ledger"."entry_type" IN ('credit_issued','credit_applied','credit_expired','adjustment'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_wallet_id_wallet_accounts_id_fk"
    FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_related_invoice_id_invoices_id_fk"
    FOREIGN KEY ("related_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_related_refund_id_refunds_id_fk"
    FOREIGN KEY ("related_refund_id") REFERENCES "public"."refunds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_issued_by_user_id_users_id_fk"
    FOREIGN KEY ("issued_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_ledger_wallet_idx" ON "wallet_ledger" USING btree ("wallet_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_ledger_wallet_created_idx" ON "wallet_ledger" USING btree ("wallet_id","created_at");

-- =====================================================================
-- INVOICE_ESCALATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS "invoice_escalations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL,
  "level" smallint DEFAULT 1 NOT NULL,
  "reminders_sent" integer DEFAULT 0 NOT NULL,
  "last_reminder_at" timestamp with time zone,
  "next_reminder_at" timestamp with time zone,
  "lock_suspended" boolean DEFAULT false NOT NULL,
  "flag_waived_at" timestamp with time zone,
  "flag_waived_by_user_id" uuid,
  "extended_due_at" timestamp with time zone,
  "last_action_at" timestamp with time zone,
  "last_action_by_user_id" uuid,
  "last_action_kind" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invoice_escalation_level_check" CHECK ("invoice_escalations"."level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_escalations" ADD CONSTRAINT "invoice_escalations_invoice_id_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_escalations" ADD CONSTRAINT "invoice_escalations_flag_waived_by_user_id_users_id_fk"
    FOREIGN KEY ("flag_waived_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_escalations" ADD CONSTRAINT "invoice_escalations_last_action_by_user_id_users_id_fk"
    FOREIGN KEY ("last_action_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_escalation_invoice_uniq" ON "invoice_escalations" USING btree ("invoice_id");

-- =====================================================================
-- OVERDUE_REMINDER_LOG
-- =====================================================================
CREATE TABLE IF NOT EXISTS "overdue_reminder_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "escalation_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "channel" text DEFAULT 'email' NOT NULL,
  "template_code" text,
  "status" text DEFAULT 'sent' NOT NULL,
  "error_message" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reminder_log_channel_check" CHECK ("overdue_reminder_log"."channel" IN ('email','sms','in_app')),
  CONSTRAINT "reminder_log_status_check" CHECK ("overdue_reminder_log"."status" IN ('queued','sent','failed'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "overdue_reminder_log" ADD CONSTRAINT "overdue_reminder_log_escalation_id_invoice_escalations_id_fk"
    FOREIGN KEY ("escalation_id") REFERENCES "public"."invoice_escalations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "overdue_reminder_log" ADD CONSTRAINT "overdue_reminder_log_invoice_id_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_log_invoice_idx" ON "overdue_reminder_log" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_log_escalation_idx" ON "overdue_reminder_log" USING btree ("escalation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_log_sent_at_idx" ON "overdue_reminder_log" USING btree ("sent_at");

-- =====================================================================
-- QUICKBOOKS_SYNC_LOGS
-- =====================================================================
CREATE TABLE IF NOT EXISTS "quickbooks_sync_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "qb_id" text,
  "action" text DEFAULT 'create' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "summary" text,
  "error_message" text,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "qb_sync_entity_check" CHECK ("quickbooks_sync_logs"."entity_type" IN ('invoice','payment','refund','credit_memo')),
  CONSTRAINT "qb_sync_action_check" CHECK ("quickbooks_sync_logs"."action" IN ('create','update','delete')),
  CONSTRAINT "qb_sync_status_check" CHECK ("quickbooks_sync_logs"."status" IN ('queued','syncing','succeeded','failed'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "quickbooks_sync_logs" ADD CONSTRAINT "quickbooks_sync_logs_org_id_orgs_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_sync_org_attempted_idx" ON "quickbooks_sync_logs" USING btree ("org_id","attempted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qb_sync_entity_idx" ON "quickbooks_sync_logs" USING btree ("entity_type","entity_id");
