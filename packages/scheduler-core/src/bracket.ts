/**
 * Single-elimination bracket for any number of teams from 2 (FR-3.13.2).
 * The bracket is the next power of two; the top seeds get byes into
 * round 2. Every real game takes one playoff ice slot, earliest rounds
 * first. A slot whose two teams are known (a round-1 game, or a round-2
 * game between two bye teams) gets its game at once; the rest wait for
 * results (scheduler-bracket-advance).
 *
 * ====================================================================
 *  CANONICAL SOURCE: packages/scheduler-core/src/bracket.ts
 *  DENO MIRROR:      supabase/functions/_shared/bracket.ts
 *  Byte copy below the header; no imports. Update both together.
 * ====================================================================
 */

export interface BracketIce {
  id: string;
  startTsUtc: string;
  surfaceId: string;
  surfaceLabel: string;
  venueName: string;
  tz: string | null;
}

export interface BracketSlot {
  round: number;
  position: number;
  iceSlotId: string | null;
  startTsUtc: string | null;
  surfaceLabel: string | null;
  venueName: string | null;
  gameId: string | null;
  seedA: number | null;
  seedB: number | null;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  /** True when one side has no opponent: the team goes through without a game. */
  bye: boolean;
  nextSlotPosition: number | null;
  nextSlotSide: "A" | "B" | null;
}

/** Standard seed order: for 8, [1, 8, 4, 5, 2, 7, 3, 6]. */
export function seedOrdering(n: number): number[] {
  if (n === 1) return [1];
  const out: number[] = [];
  for (const s of seedOrdering(n / 2)) out.push(s, n + 1 - s);
  return out;
}

export function bracketSize(teams: number): number {
  let p = 1;
  while (p < teams) p *= 2;
  return p;
}

/** Games a bracket of `teams` needs (each game knocks one team out). */
export const bracketGames = (teams: number) => Math.max(0, teams - 1);

/**
 * Build the slots. `seeds` are team ids best first. `ice` is the playoff
 * ice in date order; it must hold at least seeds.length - 1 slots.
 */
export function buildBracket(seeds: ReadonlyArray<string>, ice: ReadonlyArray<BracketIce>): BracketSlot[] {
  const n = seeds.length;
  if (n < 2) throw new Error("A bracket needs at least 2 teams.");
  if (ice.length < n - 1) throw new Error(`A bracket of ${n} teams needs ${n - 1} playoff ice slots.`);
  const size = bracketSize(n);
  const rounds = Math.log2(size);
  const order = seedOrdering(size);
  const slots: BracketSlot[] = [];
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position++) {
      const last = round === rounds;
      const s: BracketSlot = {
        round, position, iceSlotId: null, startTsUtc: null, surfaceLabel: null, venueName: null,
        gameId: null, seedA: null, seedB: null, teamAId: null, teamBId: null, winnerTeamId: null, bye: false,
        nextSlotPosition: last ? null : Math.floor(position / 2),
        nextSlotSide: last ? null : position % 2 === 0 ? "A" : "B"
      };
      if (round === 1) {
        const a = order[position * 2]!;
        const b = order[position * 2 + 1]!;
        s.seedA = a;
        s.teamAId = seeds[a - 1]!;
        if (b <= n) {
          s.seedB = b;
          s.teamBId = seeds[b - 1]!;
        } else {
          s.bye = true;
          s.winnerTeamId = s.teamAId;
        }
      }
      slots.push(s);
    }
  }
  // Byes go straight through to round 2.
  for (const s of slots.filter((x) => x.bye)) {
    const next = slots.find((x) => x.round === 2 && x.position === s.nextSlotPosition);
    if (!next) continue;
    if (s.nextSlotSide === "A") { next.teamAId = s.teamAId; next.seedA = s.seedA; }
    else { next.teamBId = s.teamAId; next.seedB = s.seedA; }
  }
  // Ice for every real game, earliest rounds first.
  let k = 0;
  for (const s of slots) {
    if (s.bye) continue;
    const i = ice[k++]!;
    s.iceSlotId = i.id;
    s.startTsUtc = i.startTsUtc;
    s.surfaceLabel = i.surfaceLabel;
    s.venueName = i.venueName;
  }
  return slots;
}

/** Home team for a slot's game: the better (lower) seed. */
export function homeAndAway(s: BracketSlot): { homeTeamId: string; awayTeamId: string } {
  const aFirst = (s.seedA ?? 99) <= (s.seedB ?? 99);
  return aFirst
    ? { homeTeamId: s.teamAId!, awayTeamId: s.teamBId! }
    : { homeTeamId: s.teamBId!, awayTeamId: s.teamAId! };
}

/**
 * The winner the final score gives (FR-3.13.3: the server, not a click,
 * decides who goes through). Null while the game is not final or tied.
 */
export function winnerFromResult(g: {
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}): string | null {
  if (g.status !== "completed" && g.status !== "forfeited") return null;
  if (g.homeScore === g.awayScore) return null;
  return g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
}
