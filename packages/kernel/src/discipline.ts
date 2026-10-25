/**
 * Automatic suspensions (UC-14, COMP-11): which penalties in a finalized
 * game suspend a player, and for how many games. Pure; the API runs it
 * inside the finalize transaction and issues the result. Unit tests:
 * discipline.test.ts.
 *
 * Defaults follow the governing body and PPHL's own use case
 * (doc/traceability/benchmark.md C.2 R11-R12):
 *   - USA Hockey Rule 404(b): a game misconduct sits out the team's next game.
 *   - USA Hockey Rule 405: a match penalty suspends until a hearing.
 *   - A second major in the same game: at least two games.
 *   - UC-14: "3 misconducts = 1 game suspension" (per season).
 * Penalty-minute thresholds differ by league, so they are off until a
 * league sets one.
 */

/** Marked on a penalty when the player was ejected (USA Hockey 404 / 405). */
export const EJECTION_TYPES = ["game_misconduct", "match"] as const;
export type EjectionType = (typeof EJECTION_TYPES)[number];
export const EJECTION_LABELS: Record<EjectionType, string> = {
  game_misconduct: "Game misconduct",
  match: "Match penalty"
};
export function isEjectionType(v: unknown): v is EjectionType {
  return typeof v === "string" && (EJECTION_TYPES as readonly string[]).includes(v);
}

export interface DisciplineRules {
  /** Off: nothing is issued automatically; admins still issue by hand. */
  enabled: boolean;
  /** Games for a game misconduct. 0 = no automatic suspension. */
  gameMisconductGames: number;
  /** A match penalty suspends until an admin lifts it. */
  matchPenaltyUntilLifted: boolean;
  /** Games for a second major (5 min) in the same game. 0 = off. */
  secondMajorGames: number;
  /** Every N misconducts in a season. 0 = off. */
  misconductsPerSuspension: number;
  misconductSuspensionGames: number;
  /** Every N penalty minutes in a season. 0 = off. */
  pimPerSuspension: number;
  pimSuspensionGames: number;
}

/**
 * Off until a league admin turns it on (UC-14 precondition: the league
 * defines its rules). The numbers are the recommended starting values the
 * Edit league dialog shows.
 */
export const DEFAULT_DISCIPLINE_RULES: DisciplineRules = {
  enabled: false,
  gameMisconductGames: 1,
  matchPenaltyUntilLifted: true,
  secondMajorGames: 2,
  misconductsPerSuspension: 3,
  misconductSuspensionGames: 1,
  pimPerSuspension: 0,
  pimSuspensionGames: 1
};

const MAX_GAMES = 99;
const MAX_COUNT = 99;
const MAX_PIM = 999;

function intIn(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
}

/** Stored rules (league metadata.discipline) merged over the defaults. */
export function readDisciplineRules(raw: unknown): DisciplineRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_DISCIPLINE_RULES;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    gameMisconductGames: intIn(r.gameMisconductGames, 0, MAX_GAMES, d.gameMisconductGames),
    matchPenaltyUntilLifted:
      typeof r.matchPenaltyUntilLifted === "boolean" ? r.matchPenaltyUntilLifted : d.matchPenaltyUntilLifted,
    secondMajorGames: intIn(r.secondMajorGames, 0, MAX_GAMES, d.secondMajorGames),
    misconductsPerSuspension: intIn(r.misconductsPerSuspension, 0, MAX_COUNT, d.misconductsPerSuspension),
    misconductSuspensionGames: intIn(r.misconductSuspensionGames, 1, MAX_GAMES, d.misconductSuspensionGames),
    pimPerSuspension: intIn(r.pimPerSuspension, 0, MAX_PIM, d.pimPerSuspension),
    pimSuspensionGames: intIn(r.pimSuspensionGames, 1, MAX_GAMES, d.pimSuspensionGames)
  };
}

/** Problem with rules an admin typed, in words, or null. */
export function validateDisciplineRules(r: Partial<Record<keyof DisciplineRules, unknown>>): string | null {
  const games: Array<[keyof DisciplineRules, string, number]> = [
    ["gameMisconductGames", "Games for a game misconduct", 0],
    ["secondMajorGames", "Games for a second major in one game", 0],
    ["misconductSuspensionGames", "Games per misconduct suspension", 1],
    ["pimSuspensionGames", "Games per penalty-minute suspension", 1]
  ];
  for (const [k, label, lo] of games) {
    if (r[k] === undefined) continue;
    const n = Number(r[k]);
    if (!Number.isInteger(n) || n < lo || n > MAX_GAMES) return `${label} must be a whole number from ${lo} to ${MAX_GAMES}.`;
  }
  if (r.misconductsPerSuspension !== undefined) {
    const n = Number(r.misconductsPerSuspension);
    if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT) return `Misconducts per suspension must be 0 (off) to ${MAX_COUNT}.`;
  }
  if (r.pimPerSuspension !== undefined) {
    const n = Number(r.pimPerSuspension);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PIM) return `Penalty minutes per suspension must be 0 (off) to ${MAX_PIM}.`;
  }
  return null;
}

/** One penalty from the game being finalized, in scoresheet order. */
export interface DisciplinePenalty {
  eventId: string;
  personId: string;
  teamId: string | null;
  minutes: number;
  ejection: EjectionType | null;
}

/** A player's season so far, before this game. */
export interface DisciplineHistory {
  misconducts: number;
  pim: number;
}

export type DisciplineRuleKey = "match" | "game_misconduct" | "second_major" | "misconducts" | "pim";

/** One suspension for one player from one game (rules that fired add up). */
export interface AutoSuspension {
  personId: string;
  teamId: string | null;
  /** The penalty that triggered it (first one, when several rules fired). */
  triggerEventId: string;
  kind: "n_games" | "indefinite";
  nGames: number | null;
  rules: DisciplineRuleKey[];
  reason: string;
}

/** A misconduct for counting: 10 minutes, or a game misconduct. */
export function isMisconduct(p: Pick<DisciplinePenalty, "minutes" | "ejection">): boolean {
  return p.minutes === 10 || p.ejection === "game_misconduct";
}

function gamesWord(n: number): string {
  return `${n} game${n === 1 ? "" : "s"}`;
}

/**
 * What the rules issue for this game. `history` holds each player's
 * misconducts and penalty minutes in the season before this game.
 */
export function evaluateGameDiscipline(
  rules: DisciplineRules,
  penalties: ReadonlyArray<DisciplinePenalty>,
  history: ReadonlyMap<string, DisciplineHistory>
): AutoSuspension[] {
  if (!rules.enabled) return [];
  const byPerson = new Map<string, DisciplinePenalty[]>();
  for (const p of penalties) {
    const list = byPerson.get(p.personId) ?? [];
    list.push(p);
    byPerson.set(p.personId, list);
  }
  const out: AutoSuspension[] = [];
  for (const [personId, list] of byPerson) {
    const teamId = list[0]?.teamId ?? null;
    const match = list.find((p) => p.ejection === "match");
    if (match && rules.matchPenaltyUntilLifted) {
      out.push({
        personId,
        teamId: match.teamId ?? teamId,
        triggerEventId: match.eventId,
        kind: "indefinite",
        nGames: null,
        rules: ["match"],
        reason: "Automatic: match penalty. Suspended until a league admin lifts it after a hearing."
      });
      continue;
    }

    const fired: Array<{ key: DisciplineRuleKey; games: number; eventId: string; words: string }> = [];
    const gm = list.find((p) => p.ejection === "game_misconduct");
    if (gm && rules.gameMisconductGames > 0) {
      fired.push({ key: "game_misconduct", games: rules.gameMisconductGames, eventId: gm.eventId, words: "game misconduct" });
    }
    const majors = list.filter((p) => p.minutes === 5);
    if (majors.length >= 2 && rules.secondMajorGames > 0) {
      fired.push({ key: "second_major", games: rules.secondMajorGames, eventId: majors[1]!.eventId, words: "second major in one game" });
    }
    const before = history.get(personId) ?? { misconducts: 0, pim: 0 };
    if (rules.misconductsPerSuspension > 0) {
      let count = before.misconducts;
      for (const p of list) {
        if (!isMisconduct(p)) continue;
        count += 1;
        if (count % rules.misconductsPerSuspension === 0) {
          fired.push({
            key: "misconducts",
            games: rules.misconductSuspensionGames,
            eventId: p.eventId,
            words: `${count} misconducts this season`
          });
        }
      }
    }
    if (rules.pimPerSuspension > 0) {
      let pim = before.pim;
      for (const p of list) {
        const prev = pim;
        pim += p.minutes;
        const crossings = Math.floor(pim / rules.pimPerSuspension) - Math.floor(prev / rules.pimPerSuspension);
        if (crossings > 0) {
          fired.push({
            key: "pim",
            games: crossings * rules.pimSuspensionGames,
            eventId: p.eventId,
            words: `${pim} penalty minutes this season`
          });
        }
      }
    }
    if (fired.length === 0) continue;
    const total = Math.min(MAX_GAMES, fired.reduce((a, f) => a + f.games, 0));
    out.push({
      personId,
      teamId,
      triggerEventId: fired[0]!.eventId,
      kind: "n_games",
      nGames: total,
      rules: [...new Set(fired.map((f) => f.key))],
      reason: `Automatic: ${fired.map((f) => f.words).join("; ")}. Sits out the team's next ${gamesWord(total)}.`
    });
  }
  return out;
}
