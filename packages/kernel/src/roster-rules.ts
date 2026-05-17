/**
 * Roster management — domain rules shared by API + UI (Workflow 7B).
 *
 * Per CLAUDE.md "canonical catalogue" rule: every constant that needs
 * to be agreed-upon between API and UI lives in kernel, not duplicated
 * per app.
 */

// =====================================================================
// MOVE TYPES — must match the CHECK constraint on roster_moves.move_type
// =====================================================================
export const ROSTER_MOVE_TYPES = [
  "add",
  "drop",
  "trade_in",
  "trade_out",
  "call_up",
  "send_down",
  "release",
  "reinstate",
  "guest_add",
  "guest_remove",
  "captain_assign",
  "captain_revoke"
] as const;
export type RosterMoveType = (typeof ROSTER_MOVE_TYPES)[number];

// =====================================================================
// TEAM MEMBERSHIP STATUS — must match team_memberships.current_status
// =====================================================================
export const TEAM_MEMBERSHIP_STATUSES = [
  "active",
  "released",
  "suspended",
  "ineligible"
] as const;
export type TeamMembershipStatus = (typeof TEAM_MEMBERSHIP_STATUSES)[number];

// =====================================================================
// TEAM INVITE STATUS — matches team_invites.status check
// =====================================================================
export const TEAM_INVITE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "revoked",
  "extended"
] as const;
export type TeamInviteStatus = (typeof TEAM_INVITE_STATUSES)[number];

// =====================================================================
// CAPTAIN RULES — fixed across the platform
// =====================================================================
/** Drop / trade_out require a written reason of at least this length. */
export const ROSTER_DROP_REASON_MIN_CHARS = 20;

/** Captain may resend an invite at most this many times per season. */
export const MAX_INVITE_EXTENSIONS = 2;

/** Cooldown between resends of the same invite. */
export const INVITE_RESEND_COOLDOWN_HOURS = 24;

/** Days until a fresh personal invite expires. */
export const INVITE_DEFAULT_TTL_DAYS = 14;

/** When a captain extends, the new expiry is offset by this many days. */
export const INVITE_EXTENSION_DAYS = 7;

// =====================================================================
// DIVISION RULE-SET OVERRIDES — JSONB on `divisions.rule_set_overrides`
// Reads via `resolveDivisionRules`; admin-edited per division.
// =====================================================================
export interface DivisionRuleSetOverrides {
  /** Hard cap on active roster size per team. */
  maxRosterSize?: number;
  /** Min games to be playoff-eligible (warning only, not a hard block). */
  minGamesForPlayoffs?: number;
  /** Hard cap on guest players per single game per team. */
  maxGuestPlayersPerGame?: number;
  /** Hard cap on guest appearances per player per team per season. */
  guestPlayerSeasonLimit?: number;
  /** Optional age-eligibility override (defaults derive from ageGroup). */
  ageMinYears?: number;
  ageMaxYears?: number;
}

/**
 * Safe defaults when a division has not been customised. Tuned to the
 * Power Play Hockey League (PPHL) example in the App-Reference PDF.
 */
export const DIVISION_RULES_DEFAULTS: Required<
  Pick<
    DivisionRuleSetOverrides,
    | "maxRosterSize"
    | "minGamesForPlayoffs"
    | "maxGuestPlayersPerGame"
    | "guestPlayerSeasonLimit"
  >
> = {
  maxRosterSize: 20,
  minGamesForPlayoffs: 8,
  maxGuestPlayersPerGame: 2,
  guestPlayerSeasonLimit: 5
};

// =====================================================================
// TRANSFER STATE MACHINE — must match transfer_requests.status check
// =====================================================================
export const TRANSFER_STATES = [
  /** Source captain initiated; destination captain has not yet acted. */
  "pending_destination",
  /** Destination captain accepted; awaiting league admin approval. */
  "pending_admin",
  /** Admin approved; roster_moves drop+add written, invoices adjusted. */
  "approved",
  /** Rejected by admin or source captain. */
  "rejected",
  /** Cancelled by source captain before destination acted. */
  "cancelled"
] as const;
export type TransferState = (typeof TRANSFER_STATES)[number];

export const TRANSFER_TRANSITIONS: Record<
  TransferState,
  ReadonlyArray<TransferState>
> = {
  pending_destination: ["pending_admin", "rejected", "cancelled"],
  pending_admin: ["approved", "rejected"],
  approved: [],
  rejected: [],
  cancelled: []
};

export function isTransferState(v: unknown): v is TransferState {
  return (
    typeof v === "string" &&
    (TRANSFER_STATES as ReadonlyArray<string>).includes(v)
  );
}

export function assertValidTransferTransition(
  from: TransferState,
  to: TransferState
): void {
  const allowed = TRANSFER_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `Illegal transfer transition: ${from} → ${to}. Allowed: ${allowed.length === 0 ? "(terminal)" : allowed.join(", ")}.`
    );
  }
}

/**
 * Resolve a stored `divisions.rule_set_overrides` JSONB blob into a
 * fully-defaulted object. Use this everywhere a rule is consulted.
 *
 * Lenient reader: accepts both the flat shape this interface declares
 * AND the nested shape the org-setup wizard writes
 * (`{ageRange:{min,max}, gameRules:{maxRosterSize,...}}`). Without this
 * normalisation, configured age ranges + roster caps silently fall
 * back to defaults (BUG-034).
 */
export function resolveDivisionRules(
  raw: Record<string, unknown> | null | undefined
): Required<
  Pick<
    DivisionRuleSetOverrides,
    | "maxRosterSize"
    | "minGamesForPlayoffs"
    | "maxGuestPlayersPerGame"
    | "guestPlayerSeasonLimit"
  >
> &
  Pick<DivisionRuleSetOverrides, "ageMinYears" | "ageMaxYears"> {
  const flat: Partial<DivisionRuleSetOverrides> = {};
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const gameRules = (r.gameRules ?? {}) as Record<string, unknown>;
    const ageRange = (r.ageRange ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    flat.maxRosterSize = num(r.maxRosterSize) ?? num(gameRules.maxRosterSize);
    flat.minGamesForPlayoffs =
      num(r.minGamesForPlayoffs) ?? num(gameRules.minGamesForPlayoffs);
    flat.maxGuestPlayersPerGame =
      num(r.maxGuestPlayersPerGame) ?? num(gameRules.maxGuestPlayersPerGame);
    flat.guestPlayerSeasonLimit =
      num(r.guestPlayerSeasonLimit) ?? num(gameRules.guestPlayerSeasonLimit);
    flat.ageMinYears = num(r.ageMinYears) ?? num(ageRange.min);
    flat.ageMaxYears = num(r.ageMaxYears) ?? num(ageRange.max);
  }
  const stripUndef = Object.fromEntries(
    Object.entries(flat).filter(([, v]) => v !== undefined)
  ) as Partial<DivisionRuleSetOverrides>;
  return { ...DIVISION_RULES_DEFAULTS, ...stripUndef };
}
