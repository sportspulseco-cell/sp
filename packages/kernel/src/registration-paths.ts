/**
 * Which registration paths a season offers (REG-14).
 *
 * Spec: doc/specs/registration-module-v2.md §1.2 and §3.1.2 —
 * "Registration type: Team / Individual / Both. Determines paths shown."
 * Stored in `seasons.config.registrationType` (JSONB, no column), edited
 * on the registration setup's Season step. One rule for the funnel's
 * path cards and for the API, which refuses a path the season does not
 * offer.
 *
 * Path mapping:
 *   - team        → "Register a team" (captain) and "Captain invite"
 *                   (a player joining a team from the captain's link)
 *   - individual  → "Register as a player" and "Free agent"
 *   - both        → every path
 * The free-agent path additionally needs `allowFreeAgent` (season
 * config, default off), as the funnel already applied.
 *
 * An unset value means `both`: that is what every season offered before
 * the setting was wired, so existing seasons keep their behaviour.
 */
import { resolveSeasonConfig, type SeasonConfig } from "./season-config";

export const SEASON_REGISTRATION_TYPES = ["team", "individual", "both"] as const;
export type SeasonRegistrationType = (typeof SEASON_REGISTRATION_TYPES)[number];

export const SEASON_REGISTRATION_TYPE_LABELS: Record<SeasonRegistrationType, string> = {
  team: "Team registration (captain-led)",
  individual: "Individual registration",
  both: "Team + individual (mixed)"
};

export const DEFAULT_SEASON_REGISTRATION_TYPE: SeasonRegistrationType = "both";

export const REGISTRATION_SUBMISSION_TYPES = [
  "team",
  "individual",
  "free_agent",
  "captain_invite"
] as const;
export type RegistrationSubmissionType = (typeof REGISTRATION_SUBMISSION_TYPES)[number];

export function isSeasonRegistrationType(v: unknown): v is SeasonRegistrationType {
  return (
    typeof v === "string" &&
    (SEASON_REGISTRATION_TYPES as readonly string[]).includes(v)
  );
}

export function isRegistrationSubmissionType(v: unknown): v is RegistrationSubmissionType {
  return (
    typeof v === "string" &&
    (REGISTRATION_SUBMISSION_TYPES as readonly string[]).includes(v)
  );
}

type PathConfig = Pick<SeasonConfig, "allowFreeAgent"> & {
  registrationType?: unknown;
};

/** The season's registration type; unset or unknown values read as `both`. */
export function seasonRegistrationType(
  config: PathConfig | Record<string, unknown> | null | undefined
): SeasonRegistrationType {
  const raw = (config as PathConfig | null | undefined)?.registrationType;
  return isSeasonRegistrationType(raw) ? raw : DEFAULT_SEASON_REGISTRATION_TYPE;
}

const PATHS_BY_TYPE: Record<SeasonRegistrationType, readonly RegistrationSubmissionType[]> = {
  team: ["team", "captain_invite"],
  individual: ["individual", "free_agent"],
  both: REGISTRATION_SUBMISSION_TYPES
};

/** Funnel paths this season offers, in display order. */
export function allowedSubmissionTypes(
  config: PathConfig | Record<string, unknown> | null | undefined
): RegistrationSubmissionType[] {
  const allowFreeAgent = resolveSeasonConfig(
    (config ?? {}) as Partial<SeasonConfig>
  ).allowFreeAgent;
  return PATHS_BY_TYPE[seasonRegistrationType(config)].filter(
    (p) => p !== "free_agent" || allowFreeAgent
  );
}

const PATH_NAMES: Record<RegistrationSubmissionType, string> = {
  team: "team registration",
  individual: "individual player registration",
  free_agent: "free-agent registration",
  captain_invite: "registration from a captain's invite"
};

/**
 * Null when the season offers `type`; otherwise the sentence the API
 * returns (422) and the funnel can show.
 */
export function submissionTypeRefusal(
  config: PathConfig | Record<string, unknown> | null | undefined,
  type: RegistrationSubmissionType
): string | null {
  const allowed = allowedSubmissionTypes(config);
  if (allowed.includes(type)) return null;
  if (allowed.length === 0) {
    return "This season is not taking registrations through this form. Contact the league.";
  }
  const offer = allowed.map((p) => PATH_NAMES[p]).join(" or ");
  return `This season does not take ${PATH_NAMES[type]}. It takes ${offer}. Go back to the first step and pick one of those.`;
}
