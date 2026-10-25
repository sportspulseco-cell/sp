/**
 * Season eligibility evaluation (Workflow 7C §2, UC-05, UC-14; bugs
 * COMP-14 and COMP-17). The season sweep loads the facts, this decides.
 * Unit tests: eligibility-evaluation.test.ts.
 *
 * Rules:
 *   - Missing data is never "eligible". A date of birth needed by an age
 *     rule, a gender needed by a gendered division, or a USA Hockey ID the
 *     season requires that is missing or only self-attested leaves the
 *     record `pending`.
 *   - A suspension standing at the sweep makes the record `ineligible`
 *     (lineups refuse the player game by game; this is the season view).
 *   - A mismatch an admin must look at (gender, roster over the cap, ID
 *     mismatch) is `flagged`, not a silent pass.
 *   - An admin's waiver is never overwritten by a sweep: the fresh
 *     evaluation is recorded next to it and the status stays `waived`.
 *
 * Precedence of the record status, worst first:
 *   ineligible > expired > flagged > pending > expiring > eligible.
 */
import type {
  AgeRestrictionEvaluation,
  EligibilityStatus,
  GenderEligibilityEvaluation,
  RosterSizeEvaluation,
  RuleEvaluation,
  SuspensionEvaluation,
  UsaHockeyEvaluation
} from "./compliance";
import {
  describeSuspension,
  suspensionEndsAt,
  suspensionGamesRemaining,
  suspensionInForce,
  type SuspensionTerms
} from "./suspensions";

export interface SeasonEligibilityInput {
  now: Date;
  season: {
    /** Reference date for age (YYYY-MM-DD or Date). */
    startDate: string | Date;
    endDate: string | Date | null;
    requireUsaHockeyId: boolean;
  };
  /** The team's division this season; null when the team has no division entry. */
  division: {
    genderEligibility: string | null;
    ageMinYears?: number;
    ageMaxYears?: number;
    maxRosterSize: number;
  } | null;
  person: { dobDate: string | Date | null; genderSelfId: string | null };
  /** Active roster spots on the player's team for the season. */
  rosterCount: number;
  /** Newest identity verification for the governing body, or null. */
  usaHockeyId: {
    externalId: string;
    /** identity_verifications.status: pending | verified | mismatch | expired */
    status: string;
    expiresAt: Date | string | null;
    source: string;
  } | null;
  suspensions: Array<SuspensionTerms & { id: string; reason: string | null }>;
}

export interface SeasonEligibilityResult {
  status: Exclude<EligibilityStatus, "waived">;
  ruleEvaluation: RuleEvaluation;
  /** Plain-words reasons for any status other than eligible. */
  reasons: string[];
}

const RANK: Record<SeasonEligibilityResult["status"], number> = {
  ineligible: 5,
  expired: 4,
  flagged: 3,
  pending: 2,
  expiring: 1,
  eligible: 0
};

function toDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDay(v: Date | string): string {
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

/** Whole years from `dob` to `ref`, by calendar date (UTC). */
export function ageOnDate(dob: Date | string, ref: Date | string): number | null {
  const b = toDate(dob);
  const r = toDate(ref);
  if (!b || !r) return null;
  let years = r.getUTCFullYear() - b.getUTCFullYear();
  const m = r.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < b.getUTCDate())) years--;
  return years;
}

/** Division gender rule vs the person's self-identified gender. Null when unknown. */
export function genderMatchesDivision(
  divisionGender: string | null | undefined,
  personGender: string | null | undefined
): boolean | null {
  const e = (divisionGender ?? "open").toLowerCase();
  if (e === "open" || e === "mixed") return true;
  if (!personGender) return null;
  const i = personGender.toLowerCase();
  if (e === "male") return i === "male" || i === "m";
  if (e === "female") return i === "female" || i === "f";
  return true;
}

export function evaluateSeasonEligibility(input: SeasonEligibilityInput): SeasonEligibilityResult {
  const { now } = input;
  const checkedAt = now.toISOString();
  let status: SeasonEligibilityResult["status"] = "eligible";
  const reasons: string[] = [];
  const raise = (to: SeasonEligibilityResult["status"], why: string) => {
    if (RANK[to] > RANK[status]) status = to;
    reasons.push(why);
  };

  // Age
  const min = input.division?.ageMinYears;
  const max = input.division?.ageMaxYears;
  const ageRuleApplies = min !== undefined || max !== undefined;
  const age = input.person.dobDate ? ageOnDate(input.person.dobDate, input.season.startDate) : null;
  let ageStatus: AgeRestrictionEvaluation["status"] = "not_required";
  if (ageRuleApplies) {
    if (age === null) {
      ageStatus = "unknown";
      raise("pending", "No date of birth on file for the division's age rule.");
    } else if ((min !== undefined && age < min) || (max !== undefined && age > max)) {
      ageStatus = "ineligible";
      raise("ineligible", `Age ${age} is outside the division's range.`);
    } else {
      ageStatus = "eligible";
    }
  }
  const ageRestriction: AgeRestrictionEvaluation = {
    dobDate: input.person.dobDate ? isoDay(input.person.dobDate) : null,
    referenceDate: isoDay(input.season.startDate),
    ageGroupCode: null,
    birthYearMin: null,
    birthYearMax: null,
    ageAtReferenceDate: age,
    status: ageStatus
  };

  // Gender
  const divisionGender = input.division?.genderEligibility ?? "open";
  const match = genderMatchesDivision(divisionGender, input.person.genderSelfId);
  let genderStatus: GenderEligibilityEvaluation["status"] = "eligible";
  if (match === null) {
    genderStatus = "unknown";
    raise("pending", `No gender on file for a ${divisionGender} division.`);
  } else if (!match) {
    genderStatus = "flagged";
    raise("flagged", `Gender on file does not match the ${divisionGender} division.`);
  }
  const genderEligibility: GenderEligibilityEvaluation = {
    divisionGender,
    personGenderSelfId: input.person.genderSelfId,
    status: genderStatus
  };

  // Roster size (a team problem an admin resolves; flagged, not a pass)
  const maxRoster = input.division?.maxRosterSize ?? 0;
  const rosterBlocked = maxRoster > 0 && input.rosterCount > maxRoster;
  if (rosterBlocked) {
    raise("flagged", `The team has ${input.rosterCount} active players; the division allows ${maxRoster}.`);
  }
  const rosterSize: RosterSizeEvaluation = {
    countAtCheck: input.rosterCount,
    maxAllowed: maxRoster,
    status: rosterBlocked ? "blocked" : "eligible"
  };

  const ruleEvaluation: RuleEvaluation = { ageRestriction, genderEligibility, rosterSize };

  // USA Hockey ID, only when the season requires it
  if (input.season.requireUsaHockeyId) {
    const id = input.usaHockeyId;
    const expires = toDate(id?.expiresAt ?? null);
    const seasonEnd = toDate(input.season.endDate ?? null);
    let usa: UsaHockeyEvaluation["status"];
    if (!id) {
      usa = "not_provided";
      raise("pending", "No USA Hockey ID on file.");
    } else if (id.status === "expired" || (expires && expires.getTime() < now.getTime())) {
      usa = "expired";
      raise("expired", "USA Hockey ID has expired.");
    } else if (id.status === "mismatch") {
      usa = "mismatch";
      raise("flagged", "USA Hockey ID did not match the player.");
    } else if (id.status !== "verified") {
      usa = "pending";
      raise("pending", "USA Hockey ID is self-reported and not verified yet.");
    } else if (expires && seasonEnd && expires.getTime() <= seasonEnd.getTime()) {
      usa = "expiring";
      raise("expiring", "USA Hockey ID expires before the season ends.");
    } else {
      usa = "verified";
    }
    ruleEvaluation.usaHockeyId = {
      provided: id?.externalId ?? null,
      expiresAt: expires?.toISOString() ?? null,
      source: id?.source === "api" ? "live_api" : "self_attest",
      status: usa,
      checkedAt,
      adminWaived: false,
      waiveReason: null
    };
  }

  // Suspensions standing now
  const standing = input.suspensions.filter((s) => suspensionInForce(s, now));
  const suspension: SuspensionEvaluation = {
    status: standing.length ? "suspended" : "clear",
    checkedAt,
    suspensions: standing.map((s) => ({
      id: s.id,
      kind: s.kind,
      gamesRemaining: suspensionGamesRemaining(s),
      endsAt: suspensionEndsAt(s)?.toISOString() ?? null,
      reason: s.reason,
      label: describeSuspension(s, now)
    }))
  };
  ruleEvaluation.suspension = suspension;
  for (const s of suspension.suspensions) {
    raise("ineligible", `Suspended: ${s.label}.`);
  }

  return { status, ruleEvaluation, reasons };
}

/**
 * What a sweep writes over an existing record (COMP-17). An admin's
 * waiver stands: the evaluation is stored, the status is not touched.
 */
export function sweepOutcome(
  existingStatus: string | null | undefined,
  evaluatedStatus: string
): { status: string; keptWaiver: boolean } {
  if (existingStatus === "waived") return { status: "waived", keptWaiver: true };
  return { status: evaluatedStatus, keptWaiver: false };
}
