/**
 * Demo "Player registration" form seed — matches the mockup screens
 * verbatim so /registrations can embed the wizard inline and walk
 * through every phase with realistic questions:
 *
 *   Date of birth (date)            — required
 *   Gender (single_select)          — required
 *   Position(s) (single_select)     — required
 *   Skill level (single_select)     — required
 *   USA Hockey ID (short_text)      — required
 *   ID expiry date (date)           — required
 *   Emergency contact (short_text)  — required
 *   Medical / allergy notes (long)  — optional
 *
 * Idempotent: every seeded row is tagged metadata.demoTag = the
 * SEED_TAG below. Re-running wipes prior demo rows + a published
 * empty pricing tier so the Phase 4 (Payment) card has a tier to
 * render against.
 *
 * Run:
 *   pnpm --filter @sportspulse/db seed:registration-form-demo
 *
 * Prerequisite: at least one league exists for an org. Migrations
 * 0018 + 0019 applied.
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../schema";

const SEED_TAG = "registration-form-demo-v1";

interface DemoQuestion {
  key: string;
  label: string;
  helpText?: string;
  type:
    | "short_text"
    | "long_text"
    | "number"
    | "date"
    | "email"
    | "phone"
    | "select"
    | "multi_select"
    | "checkbox"
    | "file_upload";
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  isActive: boolean;
}

const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    key: "dob",
    label: "Date of birth",
    type: "date",
    required: true,
    placeholder: "06/15/1990",
    isActive: true
  },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    required: true,
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
      { value: "non_binary", label: "Non-binary" },
      { value: "prefer_not_to_say", label: "Prefer not to say" }
    ],
    isActive: true
  },
  {
    key: "positions",
    label: "Position(s)",
    type: "select",
    required: true,
    options: [
      { value: "forward", label: "Forward" },
      { value: "defense", label: "Defense" },
      { value: "goalie", label: "Goalie" }
    ],
    isActive: true
  },
  {
    key: "skill_level",
    label: "Skill level",
    type: "select",
    required: true,
    options: [
      { value: "A", label: "A — Elite" },
      { value: "B", label: "B — Competitive" },
      { value: "C", label: "C — Recreational" },
      { value: "D", label: "D — Beginner" }
    ],
    isActive: true
  },
  {
    key: "usa_hockey_id",
    label: "USA Hockey ID",
    helpText: "6–12 alphanumeric characters",
    type: "short_text",
    required: true,
    placeholder: "e.g. UH123456",
    isActive: true
  },
  {
    key: "usa_hockey_id_expiry",
    label: "ID expiry date",
    type: "date",
    required: true,
    isActive: true
  },
  {
    key: "emergency_contact",
    label: "Emergency contact",
    helpText: "Name + phone number",
    type: "short_text",
    required: true,
    placeholder: "Name + phone number",
    isActive: true
  },
  {
    key: "medical_notes",
    label: "Medical / allergy notes",
    helpText: "Optional — stored encrypted, visible to admin only",
    type: "long_text",
    required: false,
    placeholder: "Optional — stored encrypted, visible to admin only",
    isActive: true
  }
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const conn = postgres(url, { max: 1, ssl: "require" });
  const db = drizzle(conn, { schema, casing: "snake_case" });

  // ─── Anchor org + league ───
  const [org] = await db.select().from(schema.orgs).limit(1);
  if (!org) {
    console.error(
      "❌  No org found. Create an organisation before seeding the registration form."
    );
    process.exit(1);
  }

  const [anyLeague] = await db
    .select()
    .from(schema.leagues)
    .where(eq(schema.leagues.orgId, org.id))
    .limit(1);
  if (!anyLeague) {
    console.error(
      "❌  No league found for this org. Create one via /org-setup first."
    );
    process.exit(1);
  }

  const sportCode = anyLeague.sportCode;

  // ─── Wipe prior demo rows by tag ───
  console.log("Wiping prior demo registration form rows…");

  // Form versions cascade-delete when the form deletes. Pricing tiers
  // we delete by tag too.
  const priorForms = await db
    .select({ id: schema.registrationForms.id })
    .from(schema.registrationForms)
    .where(
      sql`${schema.registrationForms.nameTranslations}->>'demoTag' = ${SEED_TAG}`
    );
  for (const { id: formId } of priorForms) {
    await db
      .delete(schema.registrationForms)
      .where(eq(schema.registrationForms.id, formId));
  }
  await db
    .delete(schema.pricingTiers)
    .where(sql`${schema.pricingTiers.metadata}->>'demoTag' = ${SEED_TAG}`);
  await db
    .delete(schema.seasons)
    .where(sql`${schema.seasons.metadata}->>'demoTag' = ${SEED_TAG}`);

  // ─── Resolve / create demo season ───
  console.log("Creating demo season…");
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() + 1);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 6);
  const regOpens = new Date();
  regOpens.setDate(regOpens.getDate() - 14);
  const regCloses = new Date(startDate);
  regCloses.setDate(regCloses.getDate() - 7);

  const [season] = await db
    .insert(schema.seasons)
    .values({
      leagueId: anyLeague.id,
      orgId: org.id,
      name: `${anyLeague.name} — Demo Registration`,
      sportCode,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      timezone: "America/New_York",
      status: "registration_open",
      registrationOpensAt: regOpens,
      registrationClosesAt: regCloses,
      rosterLockAt: regCloses,
      config: {
        requireUsaHockeyId: true,
        allowFreeAgent: true,
        parentalConsentRequired: true,
        requireLiabilityWaiver: true,
        maxRosterSize: 20
      },
      metadata: { demoTag: SEED_TAG }
    })
    .returning();
  const s = season!;
  console.log(`Season: ${s.name} (${s.id})`);

  // ─── A pricing tier so Phase 4 (Payment) has something to render ───
  await db.insert(schema.pricingTiers).values({
    seasonId: s.id,
    name: "Full season player registration",
    description: "Includes ice time, jersey fees, ref payments",
    code: "FULL_SEASON",
    currency: "USD",
    fullPriceCents: 485_000,
    isFree: false,
    paymentPlanEnabled: true,
    depositCents: 100_000,
    installmentCount: 2,
    installmentIntervalDays: 30,
    metadata: { demoTag: SEED_TAG }
  });

  // ─── The form itself ───
  console.log("Creating Player registration form…");
  const [form] = await db
    .insert(schema.registrationForms)
    .values({
      orgId: org.id,
      scope: "season",
      scopeId: s.id,
      seasonId: s.id,
      name: "Player registration",
      description: "team_captain_led",
      purpose: "season_registration",
      appliesToRoles: ["player"],
      // Tag stored in nameTranslations since registration_forms doesn't
      // have a top-level metadata column — checked first in the wipe
      // step above so re-runs replace cleanly.
      nameTranslations: { demoTag: SEED_TAG }
    })
    .returning();
  const f = form!;

  // Version 1 — published, with the mockup questions verbatim.
  const [v1] = await db
    .insert(schema.registrationFormVersions)
    .values({
      formId: f.id,
      versionNumber: 1,
      schema: {
        schemaVersion: 1,
        questions: DEMO_QUESTIONS
      },
      publishedAt: new Date(),
      locked: true
    })
    .returning();
  await db
    .update(schema.registrationForms)
    .set({ activeVersionId: v1!.id, updatedAt: sql`now()` })
    .where(eq(schema.registrationForms.id, f.id));

  console.log(
    `Form: ${f.name} (${f.id}) — published v1 with ${DEMO_QUESTIONS.length} questions`
  );

  const baseUrl =
    process.env.NEXT_PUBLIC_SUPERADMIN_WEB_URL ??
    "https://sp-superadmin.vercel.app";

  console.log("\n" + "─".repeat(60));
  console.log("Registration form seeded — open these URLs:");
  console.log("─".repeat(60));
  console.log(`Form builder      ${baseUrl}/forms/${f.id}`);
  console.log(`Public wizard     ${baseUrl}/registration/${s.id}`);
  console.log(`Submissions list  ${baseUrl}/registrations`);
  console.log("─".repeat(60));
  console.log(
    "\nRe-run anytime with `pnpm --filter @sportspulse/db seed:registration-form-demo` —"
  );
  console.log(
    "demo rows are tagged and replaced cleanly each run."
  );

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
