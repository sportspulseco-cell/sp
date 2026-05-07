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

// Workflow 1 v2 §5.3: "Level (A/B/C/D) — self-reported skill level.
// Affects division assignment validation." Single source of truth used
// in player + free_agent profiles AND eligibility rules.
const PLAYER_LEVELS = [
  { value: "A", label: "A — Top competitive" },
  { value: "B", label: "B — Competitive" },
  { value: "C", label: "C — Recreational" },
  { value: "D", label: "D — Beginner" }
];

// Spec §5.3: positions used for Goalie911 eligibility matching.
const HOCKEY_POSITIONS = [
  { value: "forward", label: "Forward" },
  { value: "defense", label: "Defense" },
  { value: "goalie", label: "Goalie" }
];

// Spec §5.4 free-agent availability: "Multi-select days of week + time
// preferences." Decomposed into days + time-of-day buckets so captains
// can filter the pool.
const TIME_OF_DAY = [
  { value: "morning", label: "Morning (before 12pm)" },
  { value: "afternoon", label: "Afternoon (12–5pm)" },
  { value: "evening", label: "Evening (5–9pm)" },
  { value: "late_night", label: "Late night (after 9pm)" }
];

// Configurable per league; ships with a sensible default set.
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "self_describe", label: "Self-describe" }
];

const SHOT_HAND_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" }
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
      q({ key: "phone", type: "phone", label: "Phone", required: true })
    ]
  },
  captain: {
    schemaVersion: 1,
    questions: [
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "yearsCaptaining",
        type: "number",
        label: "Years as captain",
        helpText: "Hockey, soccer, rugby — count any sport."
      }),
      q({
        key: "preferredCommsChannel",
        type: "select",
        label: "Preferred way to reach you on game day",
        options: [
          { value: "sms", label: "SMS" },
          { value: "email", label: "Email" },
          { value: "in_app", label: "In-app push" }
        ]
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
  // Workflow 1 v2 §5.3 — Path 2B individual player. The full canonical
  // field set the spec mandates. Fields that the spec marks "Required
  // (if enabled)" are wired as `required: true` here; the per-season
  // toggle that enables/disables them lives on the FormDefinition the
  // admin configures, NOT in the kernel schema. The kernel describes
  // the shape; the admin decides which to surface.
  player: {
    schemaVersion: 1,
    questions: [
      // --- Identity ---
      q({
        key: "dob",
        type: "date",
        label: "Date of birth",
        required: true,
        helpText:
          "Drives the parental-consent flow and division age-fit check."
      }),
      q({
        key: "gender",
        type: "select",
        label: "Gender",
        required: true,
        options: GENDER_OPTIONS
      }),
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "photoUrl",
        type: "file_upload",
        label: "Photo / avatar",
        helpText: "PNG or JPG, max 2 MB. Shown on roster + player pages."
      }),

      // --- Address (optional, not displayed publicly) ---
      q({
        key: "addressStreet",
        type: "short_text",
        label: "Street address",
        helpText: "Optional. Stored on profile, not shown publicly."
      }),
      q({ key: "addressCity", type: "short_text", label: "City" }),
      q({ key: "addressState", type: "short_text", label: "State / region" }),
      q({ key: "addressZip", type: "short_text", label: "Postal code" }),

      // --- Governing body ---
      q({
        key: "usaHockeyId",
        type: "short_text",
        label: "USA Hockey ID",
        helpText:
          "Alphanumeric, 6–12 chars. Format validated on submit; expiry must be in the future."
      }),
      q({
        key: "usaHockeyIdExpiry",
        type: "date",
        label: "USA Hockey ID expiry"
      }),

      // --- Emergency contact (spec marks both required when enabled) ---
      q({
        key: "emergencyName",
        type: "short_text",
        label: "Emergency contact name",
        required: true,
        helpText: "Person to reach in an emergency. Not shown publicly."
      }),
      q({
        key: "emergencyPhone",
        type: "phone",
        label: "Emergency contact phone",
        required: true
      }),

      // --- On-ice attributes ---
      q({
        key: "positions",
        type: "multi_select",
        label: "Position(s)",
        required: true,
        options: HOCKEY_POSITIONS,
        helpText: "Pick all you play. Used for Goalie911 eligibility matching."
      }),
      q({
        key: "shotHand",
        type: "select",
        label: "Shot hand",
        options: SHOT_HAND_OPTIONS
      }),
      q({
        key: "heightCm",
        type: "number",
        label: "Height (cm)"
      }),
      q({
        key: "weightKg",
        type: "number",
        label: "Weight (kg)"
      }),
      q({
        key: "level",
        type: "select",
        label: "Level",
        required: true,
        options: PLAYER_LEVELS,
        helpText:
          "Self-reported. Admin can override during eligibility review. Affects division assignment."
      }),

      // --- Sensitive ---
      q({
        key: "medicalNotes",
        type: "long_text",
        label: "Medical / allergy notes",
        helpText:
          "Encrypted at rest. Visible only to League Admin and Org Admin — not to captains or other players."
      })
    ]
  },
  // Free agent = a player who is not currently assigned to any team.
  // Workflow 1 v2 §5.4 — full Path 2B player schema PLUS the three
  // free-agent extras (ranked positions, availability, level
  // flexibility). Fields are kept in the same order as the player
  // schema so a player who later joins the free-agent pool keeps
  // their data — only the new fields need to be filled.
  free_agent: {
    schemaVersion: 1,
    questions: [
      // --- Identity (same as player) ---
      q({
        key: "dob",
        type: "date",
        label: "Date of birth",
        required: true
      }),
      q({
        key: "gender",
        type: "select",
        label: "Gender",
        required: true,
        options: GENDER_OPTIONS
      }),
      q({ key: "phone", type: "phone", label: "Phone", required: true }),
      q({
        key: "photoUrl",
        type: "file_upload",
        label: "Photo / avatar",
        helpText:
          "Captains see this when browsing the free-agent pool. PNG or JPG, max 2 MB."
      }),

      // --- Governing body ---
      q({
        key: "usaHockeyId",
        type: "short_text",
        label: "USA Hockey ID"
      }),
      q({
        key: "usaHockeyIdExpiry",
        type: "date",
        label: "USA Hockey ID expiry"
      }),

      // --- Emergency contact ---
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
      }),

      // --- On-ice attributes ---
      q({
        key: "positions",
        type: "multi_select",
        label: "Position(s) you can play",
        required: true,
        options: HOCKEY_POSITIONS
      }),
      q({
        key: "shotHand",
        type: "select",
        label: "Shot hand",
        options: SHOT_HAND_OPTIONS
      }),
      q({
        key: "heightCm",
        type: "number",
        label: "Height (cm)"
      }),
      q({
        key: "weightKg",
        type: "number",
        label: "Weight (kg)"
      }),
      q({
        key: "level",
        type: "select",
        label: "Level",
        required: true,
        options: PLAYER_LEVELS
      }),

      // --- Free-agent extras (spec §5.4) ---
      q({
        key: "positionFirstChoice",
        type: "select",
        label: "Preferred position — 1st choice",
        required: true,
        options: HOCKEY_POSITIONS,
        helpText:
          "Captains filter the free-agent pool by 1st-choice position."
      }),
      q({
        key: "positionSecondChoice",
        type: "select",
        label: "Preferred position — 2nd choice",
        options: HOCKEY_POSITIONS
      }),
      q({
        key: "availableDays",
        type: "multi_select",
        label: "Available days",
        options: DAYS,
        helpText: "Days you can show up. Captains filter by this."
      }),
      q({
        key: "availableTimes",
        type: "multi_select",
        label: "Available times",
        options: TIME_OF_DAY
      }),
      q({
        key: "willingLevels",
        type: "multi_select",
        label: "Willing to play at level",
        options: PLAYER_LEVELS,
        helpText:
          "Pick every level you'd accept — e.g. 'Prefer B, open to C' = check both."
      }),
      q({
        key: "lookingFor",
        type: "long_text",
        label: "What are you looking for?",
        placeholder:
          "e.g. weeknight games, friendly division, short commutes, willing to fill in late."
      }),

      // --- Sensitive ---
      q({
        key: "medicalNotes",
        type: "long_text",
        label: "Medical / allergy notes",
        helpText:
          "Encrypted at rest. Visible only to League Admin and Org Admin."
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
