/**
 * Canonical purposes a `registration_forms` row can serve.
 *
 * Mirrored exactly in the DB CHECK constraint
 * `registration_forms_purpose_check` (migration 0016). Adding a new
 * purpose requires a migration to update the CHECK.
 *
 * The form-builder UI surfaces these as a dropdown when an admin
 * creates a form; the funnel + role-profile editor query by
 * (scope, purpose, role) to find the right form to render.
 */

export const FORM_PURPOSES = [
  /** Per-season player registration form (the default; what the funnel asks for). */
  "season_registration",
  /** Per-role profile fields (replaces the kernel ROLE_PROFILE_SCHEMAS as source). */
  "role_profile",
  /** Free-agent → team application / team-creation form. */
  "team_application",
  /** Anything else the admin wants to build. */
  "custom"
] as const;

export type FormPurpose = (typeof FORM_PURPOSES)[number];

export const FORM_PURPOSE_LABELS: Record<FormPurpose, string> = {
  season_registration: "Season registration",
  role_profile: "Role profile",
  team_application: "Team application",
  custom: "Custom"
};

/** One plain line per purpose, shown under the Purpose picker. */
export const FORM_PURPOSE_HELP: Record<FormPurpose, string> = {
  season_registration: "The form players fill in to register for a season.",
  role_profile: "Extra profile questions for one role, like coach or referee.",
  team_application: "Not used yet.",
  custom: "Not used yet."
};

/**
 * Purposes offered for a new form. Nothing reads team_application or
 * custom forms yet (28 Oct 2026), so creating one would do nothing;
 * existing ones still show with their label.
 */
export const CREATABLE_FORM_PURPOSES: ReadonlyArray<FormPurpose> = ["season_registration", "role_profile"];

export function isFormPurpose(v: unknown): v is FormPurpose {
  return (
    typeof v === "string" &&
    (FORM_PURPOSES as ReadonlyArray<string>).includes(v)
  );
}
