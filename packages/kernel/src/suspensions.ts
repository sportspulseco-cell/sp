/**
 * Game suspensions (UC-14, benchmark doc/traceability/benchmark.md C R11-R15).
 *
 * Pure rules shared by the API (issue, lift, lineup refusal, finalize
 * served-game counting, eligibility sweep) and the admin and captain
 * screens. Unit tests: suspensions.test.ts.
 *
 * Shape of a suspension (table `suspensions`):
 *   - n_games       sits out the next N finalized games of the team
 *   - time_bounded  sits out every game before `endAt`
 *   - n_days        sits out every game before startAt + N days
 *   - indefinite    sits out until an admin lifts it
 *
 * What this does NOT model yet (needs a migration, see the COMP-10 / 11
 * report): league / season scope, the team the suspension is served with
 * when it was not issued from a penalty, and a "proposed" state for
 * automatic suspensions an admin still has to confirm.
 */

export const SUSPENSION_KINDS = ["n_games", "time_bounded", "indefinite", "n_days"] as const;
export type SuspensionKind = (typeof SUSPENSION_KINDS)[number];

/** Words an admin reads in the issue dialog. */
export const SUSPENSION_KIND_LABELS: Record<SuspensionKind, string> = {
  n_games: "Number of games",
  time_bounded: "Until a date",
  indefinite: "Until lifted",
  n_days: "Number of days"
};

/** The kinds the admin issue dialog offers (n_days is API-only). */
export const SUSPENSION_ISSUE_KINDS: ReadonlyArray<SuspensionKind> = [
  "n_games",
  "time_bounded",
  "indefinite"
];

export const SUSPENSION_STATUSES = ["active", "served", "lifted", "appealed"] as const;
export type SuspensionStatus = (typeof SUSPENSION_STATUSES)[number];

/** A suspension under appeal still stands until it is decided. */
export const SUSPENSION_IN_FORCE_STATUSES: ReadonlyArray<string> = ["active", "appealed"];

/** `n_games` and `n_days` are smallint columns; these are sane caps. */
export const SUSPENSION_MAX_GAMES = 99;
export const SUSPENSION_MAX_DAYS = 365;
export const SUSPENSION_REASON_MIN = 3;
export const SUSPENSION_REASON_MAX = 500;

export function isSuspensionKind(v: unknown): v is SuspensionKind {
  return typeof v === "string" && (SUSPENSION_KINDS as readonly string[]).includes(v);
}

export interface SuspensionTerms {
  kind: string;
  status: string;
  nGames: number | null;
  nDays: number | null;
  servedCount: number;
  startAt: Date | string;
  /** time_bounded: the planned end. Lifted / served: when it ended. */
  endAt: Date | string | null;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SuspensionIssueDraft {
  kind: string;
  nGames?: number | null;
  nDays?: number | null;
  endAt?: Date | string | null;
  reason?: string | null;
}

/** Null when the suspension may be issued, otherwise the message for the admin. */
export function validateSuspensionIssue(d: SuspensionIssueDraft, now: Date): string | null {
  if (!isSuspensionKind(d.kind)) return "Pick how long the suspension lasts.";
  const reason = (d.reason ?? "").trim();
  if (reason.length < SUSPENSION_REASON_MIN) return "Say why the player is suspended.";
  if (reason.length > SUSPENSION_REASON_MAX) {
    return `Keep the reason under ${SUSPENSION_REASON_MAX} characters.`;
  }
  const hasGames = d.nGames !== null && d.nGames !== undefined;
  const hasDays = d.nDays !== null && d.nDays !== undefined;
  const hasEnd = d.endAt !== null && d.endAt !== undefined && d.endAt !== "";
  if (d.kind === "n_games") {
    if (!hasGames || !Number.isInteger(d.nGames) || d.nGames! < 1 || d.nGames! > SUSPENSION_MAX_GAMES) {
      return `Enter the number of games, 1 to ${SUSPENSION_MAX_GAMES}.`;
    }
  } else if (hasGames) {
    return "A number of games only applies to a games suspension.";
  }
  if (d.kind === "n_days") {
    if (!hasDays || !Number.isInteger(d.nDays) || d.nDays! < 1 || d.nDays! > SUSPENSION_MAX_DAYS) {
      return `Enter the number of days, 1 to ${SUSPENSION_MAX_DAYS}.`;
    }
  } else if (hasDays) {
    return "A number of days only applies to a days suspension.";
  }
  if (d.kind === "time_bounded") {
    const end = toDate(d.endAt ?? null);
    if (!end) return "Pick the date the player may play again.";
    if (end.getTime() <= now.getTime()) return "The date the player may play again must be in the future.";
  } else if (hasEnd) {
    return "An end date only applies to a suspension that runs until a date.";
  }
  return null;
}

/** Null when a lift reason is acceptable, otherwise the message. */
export function validateLiftReason(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  if (r.length < SUSPENSION_REASON_MIN) return "Say why the suspension is lifted.";
  if (r.length > SUSPENSION_REASON_MAX) return `Keep the reason under ${SUSPENSION_REASON_MAX} characters.`;
  return null;
}

/** When a time-based suspension stops applying; null for game-count and indefinite ones. */
export function suspensionEndsAt(t: SuspensionTerms): Date | null {
  if (t.kind === "time_bounded") return toDate(t.endAt);
  if (t.kind === "n_days") {
    const start = toDate(t.startAt);
    if (!start || !t.nDays) return null;
    return new Date(start.getTime() + t.nDays * 86_400_000);
  }
  return null;
}

/** Games still to sit out (n_games only); 0 once it no longer stands, null for other kinds. */
export function suspensionGamesRemaining(t: SuspensionTerms): number | null {
  if (t.kind !== "n_games") return null;
  if (!SUSPENSION_IN_FORCE_STATUSES.includes(t.status)) return 0;
  return Math.max(0, (t.nGames ?? 0) - t.servedCount);
}

/**
 * Does the suspension stand at `at`? A malformed row (unknown kind, a
 * time-bounded row without an end) counts as standing: a discipline
 * record is never assumed away.
 */
export function suspensionInForce(t: SuspensionTerms, at: Date): boolean {
  if (!SUSPENSION_IN_FORCE_STATUSES.includes(t.status)) return false;
  const start = toDate(t.startAt);
  if (start && at.getTime() < start.getTime()) return false;
  if (t.kind === "n_games") return (suspensionGamesRemaining(t) ?? 0) > 0;
  if (t.kind === "time_bounded" || t.kind === "n_days") {
    const ends = suspensionEndsAt(t);
    return ends ? at.getTime() < ends.getTime() : true;
  }
  return true;
}

/**
 * Is the player barred from a game starting at `gameStart`?
 *
 * Game-count suspensions cover the team's next N games: with 2 games left
 * and one unplayed team game between the suspension and this one, this
 * game is the second and is covered; with 1 left, it is not. Time-based
 * and indefinite ones cover every game they stand at.
 */
export function suspensionBlocksGame(
  t: SuspensionTerms,
  game: { start: Date; unplayedTeamGamesBefore: number }
): boolean {
  if (!suspensionInForce(t, game.start)) return false;
  if (t.kind === "n_games") {
    return (suspensionGamesRemaining(t) ?? 0) > Math.max(0, game.unplayedTeamGamesBefore);
  }
  return true;
}

/**
 * Does finalizing this game count one game served (R13)? Only a
 * game-count suspension that already stood when the game started, for a
 * player on one of the two teams (the team of the penalty when it came
 * from one), and never the game the penalty happened in.
 */
export function servesWithFinalizedGame(
  t: SuspensionTerms,
  game: { start: Date; isSourceGame: boolean; playerOnTeamInGame: boolean }
): boolean {
  if (t.kind !== "n_games") return false;
  if (game.isSourceGame || !game.playerOnTeamInGame) return false;
  const start = toDate(t.startAt);
  if (!start || start.getTime() >= game.start.getTime()) return false;
  return (suspensionGamesRemaining(t) ?? 0) > 0;
}

/** Status after one more game is served. */
export function afterOneGameServed(t: SuspensionTerms): { servedCount: number; status: string } {
  const servedCount = t.servedCount + 1;
  const done = t.kind === "n_games" && t.nGames !== null && servedCount >= t.nGames;
  return { servedCount, status: done ? "served" : t.status };
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** One line a person reads: "2 of 3 games left", "Until Nov 3, 2026", "Lifted". */
export function describeSuspension(t: SuspensionTerms, now: Date): string {
  if (t.status === "lifted") return "Lifted";
  if (t.status === "served") return "Served";
  if (t.kind === "n_games") {
    const left = suspensionGamesRemaining(t) ?? 0;
    return `${left} of ${t.nGames ?? 0} ${t.nGames === 1 ? "game" : "games"} left`;
  }
  if (t.kind === "time_bounded" || t.kind === "n_days") {
    const ends = suspensionEndsAt(t);
    if (!ends) return "No end date recorded";
    return suspensionInForce(t, now) ? `Until ${fmtDay(ends)}` : `Ended ${fmtDay(ends)}`;
  }
  if (t.kind === "indefinite") return "Until lifted";
  return "Unknown length";
}
