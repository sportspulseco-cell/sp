/**
 * Per-role profile schemas.
 *
 * Each system role gets a `FormDefinition` describing the *additional*
 * profile fields that role expects (beyond the canonical Profile fields
 * — display name, locale, timezone — which every user has).
 *
 * Single source of truth shared by:
 *   - the Edit-profile dialog on /users
 *   - the post-invite onboarding flow (when the user signs in for the
 *     first time and we ask them to complete their profile)
 *   - the public registration funnel (a registrant who picks the
 *     "Player" path is asked the player questions; "Free agent" is
 *     asked the free-agent questions)
 *
 * A "free agent" here is by definition: a Player who is not currently
 * assigned to any team. The schema below mirrors that meaning — same
 * fields as Player plus `lookingForTeam` + `availability`.
 *
 * Persisted as JSONB on `profiles.metadata.roleProfile` keyed by role
 * code, e.g. `metadata.roleProfile.season_admin = { ... }`. A user
 * holding multiple roles can fill out each profile independently.
 */

import type { FormDefinition, FormQuestion } from "./forms";

// Tiny builder so schema literals stay terse — fills the required-but-
// uninteresting `required` + `isActive` fields with sensible defaults.
const q = (
  partial: Omit<FormQuestion, "required" | "isActive"> &
    Partial<Pick<FormQuestion, "required" | "isActive">>
): FormQuestion => ({
  required: false,
  isActive: true,
  ...partial
});

const DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" }
];

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "recreational", label: "Recreational" },
  { value: "intermediate", label: "Intermediate" },
  { value: "competitive", label: "Competitive" },
  { value: "elite", label: "Elite" }
];

export type RoleProfileSchemas = Readonly<Record<string, FormDefinition>>;

export const ROLE_PROFILE_SCHEMAS: RoleProfileSchemas = {
  super_admin: {
    schemaVersion: 1,
    questions: [
      q({
        key: "title",
        type: "short_text",
        label: "Title",
        helpText: "How you'd like to appear in audit logs (e.g. Platform Lead)."
      }),
      q({
        key: "phoneEmergency",
        type: "phone",
        label: "Emergency contact phone",
        helpText: "Reached if the platform is on fire."
      })
    ]
  },
  org_admin: {
    schemaVersion: 1,
    questions: [
      q({
        key: "title",
        type: "short_text",
        label: "Role title at organization",
        placeholder: "e.g. President, Director of Operations"
      }),
      q({ key: "phone", type: "phone", label: "Phone", required: true })
    ]
  },
  league_admin: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "yearsRunning",
        type: "number",
        label: "Years running leagues",
        helpText: "Helps us pick examples that match your experience level."
      })
    ]
  },
  season_admin: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true })
    ]
  },
  division_admin: {
    schemaVersion: 1,
    questions: [q({ key: "phone", type: "phone", label: "Phone" })]
  },
  team_admin: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "isCaptain",
        type: "checkbox",
        label: "I'm also the team captain",
        helpText: "Captains can submit lineups and accept invites."
      })
    ]
  },
  coach: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({ key: "yearsCoaching", type: "number", label: "Years coaching" }),
      q({
        key: "certification",
        type: "short_text",
        label: "Coaching certification",
        placeholder: "e.g. USA Hockey Level 3"
      })
    ]
  },
  registrar: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true })
    ]
  },
  referee: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "certificationLevel",
        type: "select",
        label: "Certification level",
        required: true,
        options: [
          { value: "level_1", label: "Level 1" },
          { value: "level_2", label: "Level 2" },
          { value: "level_3", label: "Level 3" },
          { value: "level_4", label: "Level 4" },
          { value: "national", label: "National" }
        ]
      }),
      q({
        key: "availableDays",
        type: "multi_select",
        label: "Available days",
        options: DAYS
      })
    ]
  },
  scorekeeper: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "availableDays",
        type: "multi_select",
        label: "Available days",
        options: DAYS
      })
    ]
  },
  player: {
    schemaVersion: 1,
    questions: [
      q({ key: "dob", type: "date", label: "Date of birth", required: true }),
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "jerseySize",
        type: "select",
        label: "Jersey size",
        options: [
          { value: "youth_s", label: "Youth S" },
          { value: "youth_m", label: "Youth M" },
          { value: "youth_l", label: "Youth L" },
          { value: "adult_s", label: "Adult S" },
          { value: "adult_m", label: "Adult M" },
          { value: "adult_l", label: "Adult L" },
          { value: "adult_xl", label: "Adult XL" },
          { value: "adult_xxl", label: "Adult XXL" }
        ]
      }),
      q({
        key: "preferredPosition",
        type: "short_text",
        label: "Preferred position",
        placeholder: "e.g. Forward, Goalkeeper, Midfielder"
      }),
      q({
        key: "skillLevel",
        type: "select",
        label: "Skill level",
        options: SKILL_LEVELS
      }),
      q({
        key: "emergencyName",
        type: "short_text",
        label: "Emergency contact name",
        required: true
      }),
      q({
        key: "emergencyPhone",
        type: "phone",
        label: "Emergency contact phone",
        required: true
      })
    ]
  },
  // Free agent = a player who is not currently assigned to any team.
  // Schema mirrors Player + fields the free-agent pool needs to surface
  // them to captains.
  free_agent: {
    schemaVersion: 1,
    questions: [
      q({ key: "dob", type: "date", label: "Date of birth", required: true }),
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "preferredPosition",
        type: "short_text",
        label: "Preferred position",
        required: true
      }),
      q({
        key: "skillLevel",
        type: "select",
        label: "Skill level",
        required: true,
        options: SKILL_LEVELS
      }),
      q({
        key: "lookingFor",
        type: "long_text",
        label: "What are you looking for?",
        placeholder:
          "e.g. weeknight games, friendly division, short commutes, willing to fill in late."
      }),
      q({
        key: "availableDays",
        type: "multi_select",
        label: "Available days",
        options: DAYS
      }),
      q({
        key: "emergencyName",
        type: "short_text",
        label: "Emergency contact name",
        required: true
      }),
      q({
        key: "emergencyPhone",
        type: "phone",
        label: "Emergency contact phone",
        required: true
      })
    ]
  },
  parent: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "dependantsNote",
        type: "long_text",
        label: "Dependants",
        helpText:
          "We'll link dependants formally on the Persons page; this is just a heads-up."
      })
    ]
  },
  spectator: {
    schemaVersion: 1,
    questions: []
  }
};

export function profileSchemaFor(roleCode: string): FormDefinition {
  return (
    ROLE_PROFILE_SCHEMAS[roleCode] ?? {
      schemaVersion: 1,
      questions: []
    }
  );
}
