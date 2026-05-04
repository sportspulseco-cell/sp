import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  char,
  boolean,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { citext } from "./_helpers";
import { authUsers } from "./auth";
import { countries, locales, currencies } from "./reference";

// =====================================================================
// PROFILES — extends auth.users (1:1)
// =====================================================================
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: citext("email").unique(),
    phoneE164: text("phone_e164").unique(),
    legalFirstName: text("legal_first_name"),
    legalLastName: text("legal_last_name"),
    preferredName: text("preferred_name"),
    displayName: text("display_name"),
    photoUrl: text("photo_url"),
    dobDate: date("dob_date"),
    genderSelfId: text("gender_self_id"),
    pronouns: text("pronouns"),
    countryCode: char("country_code", { length: 2 }).references(
      () => countries.code
    ),
    locale: text("locale")
      .notNull()
      .default("en-US")
      .references(() => locales.code),
    timezone: text("timezone").notNull().default("UTC"),
    status: text("status").notNull().default("active"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "profiles_status_check",
      sql`${t.status} IN ('pending','active','suspended','deleted')`
    ),
    statusIdx: index("profiles_status_idx")
      .on(t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    countryIdx: index("profiles_country_idx").on(t.countryCode)
  })
);

// =====================================================================
// ORGS — tenant root
// =====================================================================
export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    orgType: text("org_type").notNull(),
    countryCode: char("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    defaultLocale: text("default_locale")
      .notNull()
      .references(() => locales.code),
    defaultCurrency: char("default_currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    defaultTimezone: text("default_timezone").notNull().default("UTC"),
    status: text("status").notNull().default("active"),
    branding: jsonb("branding").notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    orgTypeCheck: check(
      "orgs_org_type_check",
      sql`${t.orgType} IN ('governing_body','federation','league_operator','club','association','school','tournament_operator')`
    ),
    statusCheck: check(
      "orgs_status_check",
      sql`${t.status} IN ('active','suspended','archived')`
    ),
    countryIdx: index("orgs_country_idx").on(t.countryCode),
    statusIdx: index("orgs_status_idx")
      .on(t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    orgTypeIdx: index("orgs_org_type_idx").on(t.orgType)
  })
);

// =====================================================================
// ORG_RELATIONS — recursive parent/child (governing body → federation → club)
// =====================================================================
export const orgRelations = pgTable(
  "org_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentOrgId: uuid("parent_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    childOrgId: uuid("child_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    relationCheck: check(
      "org_relations_relation_check",
      sql`${t.relation} IN ('sanctions','member_of','owns')`
    ),
    notSelf: check(
      "org_relations_not_self",
      sql`${t.parentOrgId} <> ${t.childOrgId}`
    ),
    parentIdx: index("org_relations_parent_idx").on(t.parentOrgId),
    childIdx: index("org_relations_child_idx").on(t.childOrgId),
    uniqEdge: uniqueIndex("org_relations_uniq_edge").on(
      t.parentOrgId,
      t.childOrgId,
      t.relation
    )
  })
);

// =====================================================================
// ROLES — system + per-org
// =====================================================================
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }), // NULL = system role
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    permissions: jsonb("permissions").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    orgIdx: index("roles_org_idx").on(t.orgId),
    uniqOrgCode: uniqueIndex("roles_org_code_uniq").on(t.orgId, t.code)
  })
);

// =====================================================================
// USER_ROLE_ASSIGNMENTS — RBAC + ABAC scope
// =====================================================================
export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    grantedByUserId: uuid("granted_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    scopeTypeCheck: check(
      "ura_scope_type_check",
      sql`${t.scopeType} IN ('platform','org','league','season','division','team','game')`
    ),
    userIdx: index("ura_user_idx").on(t.userId),
    roleIdx: index("ura_role_idx").on(t.roleId),
    scopeIdx: index("ura_scope_idx").on(t.scopeType, t.scopeId),
    activeIdx: index("ura_user_active_idx")
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`)
  })
);

// =====================================================================
// CROSS_ORG_GRANTS — explicit cross-tenant access
// =====================================================================
export const crossOrgGrants = pgTable(
  "cross_org_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    fromOrgId: uuid("from_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    toOrgId: uuid("to_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    permissions: jsonb("permissions").notNull().default(sql`'[]'::jsonb`),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    grantedByUserId: uuid("granted_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    notSelf: check(
      "cog_not_self",
      sql`${t.fromOrgId} <> ${t.toOrgId}`
    ),
    userIdx: index("cog_user_idx").on(t.userId),
    toOrgIdx: index("cog_to_org_idx").on(t.toOrgId)
  })
);

// =====================================================================
// PERSONS — separate from auth.users (minors w/o login, historical figures)
// =====================================================================
export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    legalFirstName: text("legal_first_name").notNull(),
    legalLastName: text("legal_last_name").notNull(),
    preferredName: text("preferred_name"),
    dobDate: date("dob_date"),
    genderSelfId: text("gender_self_id"),
    pronouns: text("pronouns"),
    countryCode: char("country_code", { length: 2 }).references(
      () => countries.code
    ),
    photoUrl: text("photo_url"),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    externalIds: jsonb("external_ids").notNull().default(sql`'{}'::jsonb`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userIdx: index("persons_user_idx").on(t.userId),
    countryIdx: index("persons_country_idx").on(t.countryCode)
  })
);

// =====================================================================
// FAMILY_LINKS — guardian → minor
// =====================================================================
export const familyLinks = pgTable(
  "family_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    minorPersonId: uuid("minor_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull(),
    legalStatus: text("legal_status"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByUserId: uuid("verified_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    relationshipCheck: check(
      "family_links_relationship_check",
      sql`${t.relationship} IN ('parent','guardian','relative')`
    ),
    guardianIdx: index("family_links_guardian_idx").on(t.guardianUserId),
    minorIdx: index("family_links_minor_idx").on(t.minorPersonId),
    uniqGuardianMinor: uniqueIndex("family_links_uniq").on(
      t.guardianUserId,
      t.minorPersonId
    )
  })
);
