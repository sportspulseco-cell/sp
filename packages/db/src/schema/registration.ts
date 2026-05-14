import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  char,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { inet } from "./_helpers";
import { authUsers } from "./auth";
import { countries } from "./reference";
import { orgs, persons } from "./iam";
import {
  governingBodies,
  seasons,
  leagues,
  divisions,
  teams
} from "./league";

// =====================================================================
// REGISTRATION FORMS — versioned forms used for player/team registration
// =====================================================================
export const registrationForms = pgTable(
  "registration_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(), // org / league / division
    scopeId: uuid("scope_id"), // when scope = league/division
    name: text("name").notNull(),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    description: text("description"),
    /**
     * What this form is used for. Source of truth: @sportspulse/kernel
     * FORM_PURPOSES. Drives lookups from the funnel (season_registration),
     * role-profile editor (role_profile), free-agent flow
     * (team_application), and any future flow (custom).
     */
    purpose: text("purpose").notNull().default("season_registration"),
    /**
     * Role codes the form's questions apply to (e.g. ['player'] or
     * ['coach','team_admin']). Empty array = applies to all roles in
     * scope. Used by the role-profile editor to pick the right form
     * for the user's primary role.
     */
    appliesToRoles: text("applies_to_roles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * When set, the form is the registration shell for this season.
     * Drives the 6-section "Registration setup" wizard at /forms/[id]
     * — pricing tiers, divisions assignment, email templates all key
     * off this seasonId. Nullable so org / league / division-scoped
     * forms (role profiles, team applications, etc.) keep working.
     */
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "set null"
    }),
    activeVersionId: uuid("active_version_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    scopeCheck: check(
      "form_scope_check",
      sql`${t.scope} IN ('org','league','division','season')`
    ),
    purposeCheck: check(
      "registration_forms_purpose_check",
      sql`${t.purpose} IN ('season_registration','role_profile','team_application','custom')`
    ),
    orgIdx: index("form_org_idx").on(t.orgId),
    scopeIdx: index("form_scope_idx").on(t.scope, t.scopeId),
    seasonIdx: index("form_season_idx").on(t.seasonId),
    purposeIdx: index("registration_forms_purpose_idx").on(t.purpose)
    // applies_to_roles GIN index lives in migration 0016 — Drizzle
    // doesn't have first-class GIN support yet. Querying via && or
    // ANY works whether the index is here in code or only in the DB.
  })
);

export const registrationFormVersions = pgTable(
  "registration_form_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => registrationForms.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    schema: jsonb("schema").notNull().default(sql`'{}'::jsonb`),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniqFormVersion: uniqueIndex("form_version_uniq").on(
      t.formId,
      t.versionNumber
    ),
    formIdx: index("form_version_form_idx").on(t.formId)
  })
);

// =====================================================================
// REGISTRATIONS — submission of a form for a subject person
// =====================================================================
export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => registrationFormVersions.id, { onDelete: "restrict" }),
    submittedByUserId: uuid("submitted_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    subjectPersonId: uuid("subject_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    leagueId: uuid("league_id").references(() => leagues.id, {
      onDelete: "set null"
    }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null"
    }),
    /**
     * Denormalised season this registration belongs to. Set by the
     * public funnel directly (it always operates on a known
     * seasonId) and inferred by admin paths from
     * `division.season_id` or `form.season_id`.
     *
     * Drives the partial unique index `registrations_active_uniq`
     * that idempotency-checks (subject_person_id, season_id) for
     * non-cancelled statuses (P2-3 / audit §4.1 + §8.2). Nullable
     * to support org-only registrations that aren't season-bound.
     */
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "set null"
    }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "set null"
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "registration_status_check",
      // Workflow 1 v2.0 §10 state machine + legacy v1 values kept for
      // back-compat. Single source of truth: kernel/registration-states.ts.
      sql`${t.status} IN (
        'draft','pending_verification','pending_consent','pending_payment',
        'pending_offline','pending_review','incomplete','approved','rejected','cancelled',
        'submitted','under_review','waitlisted','withdrawn'
      )`
    ),
    orgIdx: index("registration_org_idx").on(t.orgId),
    statusIdx: index("registration_status_idx").on(t.status),
    subjectIdx: index("registration_subject_idx").on(t.subjectPersonId),
    leagueIdx: index("registration_league_idx").on(t.leagueId),
    divisionIdx: index("registration_division_idx").on(t.divisionId),
    teamIdx: index("registration_team_idx").on(t.teamId)
  })
);

export const registrationItems = pgTable(
  "registration_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    value: jsonb("value").notNull(),
    encrypted: boolean("encrypted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    regIdx: index("reg_item_reg_idx").on(t.registrationId),
    uniqRegField: uniqueIndex("reg_item_uniq").on(t.registrationId, t.fieldKey)
  })
);

// =====================================================================
// DOCUMENTS — versioned waivers, consents, codes of conduct
// =====================================================================
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }), // NULL = platform
    kind: text("kind").notNull(), // waiver / consent / code_of_conduct / privacy / parental
    name: text("name").notNull(),
    description: text("description"),
    activeVersionId: uuid("active_version_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    kindCheck: check(
      "document_kind_check",
      sql`${t.kind} IN ('waiver','consent','code_of_conduct','privacy','parental','media_release','injury_policy','custom')`
    ),
    orgIdx: index("document_org_idx").on(t.orgId),
    kindIdx: index("document_kind_idx").on(t.kind)
  })
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    contentHtml: text("content_html").notNull(),
    contentHash: text("content_hash").notNull(),
    languageCode: text("language_code").notNull().default("en-US"),
    jurisdictionCountryCode: char("jurisdiction_country_code", {
      length: 2
    }).references(() => countries.code),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniqDocVersion: uniqueIndex("doc_version_uniq").on(
      t.documentId,
      t.versionNumber
    ),
    docIdx: index("doc_version_doc_idx").on(t.documentId)
  })
);

export const consentSignatures = pgTable(
  "consent_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddr: inet("ip_addr"),
    userAgent: text("user_agent"),
    signedByUserId: uuid("signed_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    geolocation: jsonb("geolocation"),
    signatureBlobUrl: text("signature_blob_url"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    personIdx: index("consent_person_idx").on(t.personId),
    versionIdx: index("consent_version_idx").on(t.documentVersionId),
    uniqPersonVersion: uniqueIndex("consent_uniq").on(
      t.personId,
      t.documentVersionId
    )
  })
);

// =====================================================================
// ELIGIBILITY RECORDS — per (person, season, governing body)
// =====================================================================
export const eligibilityRecords = pgTable(
  "eligibility_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "cascade"
    }),
    governingBodyId: uuid("governing_body_id").references(
      () => governingBodies.id,
      { onDelete: "set null" }
    ),
    ruleEvaluation: jsonb("rule_evaluation")
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    waiverReason: text("waiver_reason"),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedByUserId: uuid("waived_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    evaluatedByUserId: uuid("evaluated_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "eligibility_status_check",
      sql`${t.status} IN ('pending','eligible','ineligible','expiring','expired','flagged','waived')`
    ),
    personIdx: index("eligibility_person_idx").on(t.personId),
    seasonIdx: index("eligibility_season_idx").on(t.seasonId),
    statusIdx: index("eligibility_status_idx").on(t.status),
    personSeasonUniq: uniqueIndex("eligibility_records_person_season_uniq")
      .on(t.personId, t.seasonId)
      .where(sql`${t.seasonId} IS NOT NULL`)
  })
);

// =====================================================================
// BACKGROUND CHECKS — Sterling/Checkr/local provider tracking
// =====================================================================
export const backgroundChecks = pgTable(
  "background_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalRef: text("external_ref"),
    status: text("status").notNull().default("requested"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    adjudication: jsonb("adjudication").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "bgcheck_status_check",
      sql`${t.status} IN ('requested','in_progress','clear','flagged','adverse','expired')`
    ),
    personIdx: index("bgcheck_person_idx").on(t.personId),
    statusIdx: index("bgcheck_status_idx").on(t.status)
  })
);

// =====================================================================
// IDENTITY VERIFICATIONS — governing body credentials (USA Hockey #, etc.)
// =====================================================================
export const identityVerifications = pgTable(
  "identity_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    governingBodyId: uuid("governing_body_id")
      .notNull()
      .references(() => governingBodies.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    status: text("status").notNull().default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    source: text("source").notNull().default("self_attest"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "id_verify_status_check",
      sql`${t.status} IN ('pending','verified','mismatch','expired')`
    ),
    sourceCheck: check(
      "id_verify_source_check",
      sql`${t.source} IN ('api','document_upload','self_attest')`
    ),
    personIdx: index("id_verify_person_idx").on(t.personId),
    uniqPersonGbExt: uniqueIndex("id_verify_uniq").on(
      t.personId,
      t.governingBodyId,
      t.externalId
    )
  })
);
