/**
 * Rules applied around the CP-SAT solver by scheduler-generate: slots on
 * blackout dates are left out before the solve, the fixture count is
 * checked against the slots that are left, home and away are balanced
 * after the solve (the solver always makes the earlier-listed team the
 * home team), and weekly load per team is reported.
 *
 * ====================================================================
 *  CANONICAL SOURCE: packages/scheduler-core/src/post-solve.ts
 *  DENO MIRROR:      supabase/functions/_shared/post-solve.ts
 *  The mirror is a byte copy below its header. Update both together.
 *  No imports, so the same text runs in Node and Deno.
 * ====================================================================
 */

export interface ScheduleBlackout {
  /** First blacked-out day, "YYYY-MM-DD" in the season's zone. */
  startDate: string;
  /** Last blacked-out day (inclusive). */
  endDate: string;
  /** One rink only; null = every rink in the season. */
  surfaceId: string | null;
  reason?: string | null;
}

/** "YYYY-MM-DD" as the clocks read in `timeZone` at `instant`. */
export function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The blackout that removes this slot, or null. Dates compare in `timeZone`. */
export function slotBlackout(
  slot: { startTsUtc: string; surfaceId: string },
  timeZone: string,
  blackouts: ReadonlyArray<ScheduleBlackout>
): ScheduleBlackout | null {
  const day = localDate(slot.startTsUtc, timeZone);
  for (const b of blackouts) {
    if (b.surfaceId && b.surfaceId !== slot.surfaceId) continue;
    if (day >= b.startDate && day <= b.endDate) return b;
  }
  return null;
}

/**
 * Every fixture of a round robin in the solver's order
 * (apps/scheduler-solver/main.py _enumerate_fixtures): each unordered
 * pair `gamesPerPair` times, earlier-listed team first.
 */
export function enumerateFixtures(teamIds: ReadonlyArray<string>, gamesPerPair: number): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      for (let k = 0; k < gamesPerPair; k++) out.push([teamIds[i]!, teamIds[j]!]);
    }
  }
  return out;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface PlacedGame {
  slotId: string;
  startTsUtc: string;
  /** The solver's home team (always the earlier-listed one). */
  teamA: string;
  teamB: string;
}

export interface FixedGame {
  startTsUtc: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface BalancedGame extends PlacedGame {
  homeTeamId: string;
  awayTeamId: string;
}

export interface HomeAwayCount {
  home: number;
  away: number;
}

/**
 * Decide home and away for each placed game (FR-3.8.2). Games are taken
 * in date order together with the games that stay (published, locked,
 * played), whose sides never change. A pair's second meeting reverses the
 * first, so a double round robin is exactly even. A pair's first meeting
 * goes to whichever side keeps both teams closest to even; ties go to the
 * team with fewer home games, then to the team id, so a re-run gives the
 * same answer.
 */
export function balanceHomeAway(
  placed: ReadonlyArray<PlacedGame>,
  fixed: ReadonlyArray<FixedGame> = []
): { games: BalancedGame[]; counts: Record<string, HomeAwayCount>; maxImbalance: number } {
  type Ev =
    | { kind: "fixed"; at: string; order: string; g: FixedGame }
    | { kind: "placed"; at: string; order: string; g: PlacedGame };
  const events: Ev[] = [
    ...fixed.map((g) => ({ kind: "fixed" as const, at: g.startTsUtc, order: `0${g.homeTeamId}`, g })),
    ...placed.map((g) => ({ kind: "placed" as const, at: g.startTsUtc, order: `1${g.slotId}`, g }))
  ].sort((x, y) => (x.at === y.at ? (x.order < y.order ? -1 : 1) : Date.parse(x.at) - Date.parse(y.at)));

  const counts: Record<string, HomeAwayCount> = {};
  const c = (t: string) => (counts[t] ??= { home: 0, away: 0 });
  const lastHome = new Map<string, string>();
  const out = new Map<string, BalancedGame>();
  const apply = (home: string, away: string) => {
    c(home).home++;
    c(away).away++;
  };

  for (const e of events) {
    if (e.kind === "fixed") {
      apply(e.g.homeTeamId, e.g.awayTeamId);
      lastHome.set(pairKey(e.g.homeTeamId, e.g.awayTeamId), e.g.homeTeamId);
      continue;
    }
    const { teamA: a, teamB: b } = e.g;
    const key = pairKey(a, b);
    let home: string;
    const prev = lastHome.get(key);
    if (prev) {
      home = prev === a ? b : a;
    } else {
      const diff = (t: string) => c(t).home - c(t).away;
      const score = (h: string, w: string) => {
        const dh = diff(h) + 1;
        const dw = diff(w) - 1;
        return Math.max(Math.abs(dh), Math.abs(dw)) * 1000 + dh * dh + dw * dw;
      };
      const sa = score(a, b);
      const sb = score(b, a);
      if (sa !== sb) home = sa < sb ? a : b;
      else if (c(a).home !== c(b).home) home = c(a).home < c(b).home ? a : b;
      else home = a < b ? a : b;
    }
    const away = home === a ? b : a;
    apply(home, away);
    lastHome.set(key, home);
    out.set(e.g.slotId, { ...e.g, homeTeamId: home, awayTeamId: away });
  }
  improveHomeAway(events, out, counts);
  const games = placed.map((g) => out.get(g.slotId)!);
  const maxImbalance = Object.values(counts).reduce((m, x) => Math.max(m, Math.abs(x.home - x.away)), 0);
  return { games, counts, maxImbalance };
}

/**
 * The date-order pass above never revisits a choice, so games that stay
 * (all home for one team, say) can leave a team 3-1 when 2-2 was possible
 * (J10 on staging, 27 Oct). This turns a pair's
 * meetings around, all together so they still alternate, whenever that
 * lowers the worst team's gap, or keeps it and evens the others. Only
 * meetings before any game that stays can turn. Deterministic.
 */
function improveHomeAway(
  events: ReadonlyArray<
    | { kind: "fixed"; g: FixedGame }
    | { kind: "placed"; g: PlacedGame }
  >,
  out: Map<string, BalancedGame>,
  counts: Record<string, HomeAwayCount>
): void {
  const groups = new Map<string, string[]>();
  const closed = new Set<string>();
  for (const e of events) {
    const key = e.kind === "fixed" ? pairKey(e.g.homeTeamId, e.g.awayTeamId) : pairKey(e.g.teamA, e.g.teamB);
    if (e.kind === "fixed") {
      closed.add(key);
      continue;
    }
    if (closed.has(key)) continue;
    const ids = groups.get(key) ?? [];
    ids.push(e.g.slotId);
    groups.set(key, ids);
  }
  const keys = [...groups.keys()].sort();
  const diff = (t: string) => counts[t]!.home - counts[t]!.away;
  const score = (d: Map<string, number>) => {
    let max = 0;
    let sq = 0;
    for (const t of Object.keys(counts)) {
      const v = d.get(t) ?? diff(t);
      max = Math.max(max, Math.abs(v));
      sq += v * v;
    }
    return max * 1_000_000 + sq;
  };
  let current = score(new Map());
  for (let pass = 0; pass < 50; pass++) {
    let improved = false;
    for (const key of keys) {
      const changed = new Map<string, number>();
      for (const id of groups.get(key)!) {
        const g = out.get(id)!;
        changed.set(g.homeTeamId, (changed.get(g.homeTeamId) ?? diff(g.homeTeamId)) - 2);
        changed.set(g.awayTeamId, (changed.get(g.awayTeamId) ?? diff(g.awayTeamId)) + 2);
      }
      const next = score(changed);
      if (next >= current) continue;
      for (const id of groups.get(key)!) {
        const g = out.get(id)!;
        counts[g.homeTeamId]!.home--;
        counts[g.homeTeamId]!.away++;
        counts[g.awayTeamId]!.away--;
        counts[g.awayTeamId]!.home++;
        out.set(id, { ...g, homeTeamId: g.awayTeamId, awayTeamId: g.homeTeamId });
      }
      current = next;
      improved = true;
    }
    if (!improved) break;
  }
}

/** Monday ("YYYY-MM-DD") of the week holding `day`. */
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Teams that play more than `max` games in one week (Monday to Sunday in
 * the season's zone). Reported, not enforced: the solver has no weekly
 * limit.
 */
export function weeklyOverLimit(
  games: ReadonlyArray<{ startTsUtc: string; homeTeamId: string; awayTeamId: string }>,
  timeZone: string,
  max: number
): Array<{ teamId: string; weekStart: string; games: number }> {
  const n = new Map<string, number>();
  for (const g of games) {
    const w = weekStart(localDate(g.startTsUtc, timeZone));
    for (const t of [g.homeTeamId, g.awayTeamId]) n.set(`${t}|${w}`, (n.get(`${t}|${w}`) ?? 0) + 1);
  }
  return [...n.entries()]
    .filter(([, v]) => v > max)
    .map(([k, v]) => {
      const [teamId, ws] = k.split("|") as [string, string];
      return { teamId, weekStart: ws, games: v };
    })
    .sort((x, y) => (x.weekStart === y.weekStart ? (x.teamId < y.teamId ? -1 : 1) : x.weekStart < y.weekStart ? -1 : 1));
}

/**
 * When and in which zone a game on this slot is stored. A slot keeps the
 * rink's zone; a slot whose zone was never set ("UTC") in a season with a
 * real zone was typed as season-local wall time, so its instant is read
 * again in the season's zone (an admin's "7:30 PM" stays 7:30 PM on team
 * schedules). Unknown zones fall back to the season's, then UTC.
 */
export function gameStartForSlot(
  slotStartTsUtc: string,
  slotTz: string | null | undefined,
  seasonTz: string | null | undefined
): { startTsUtc: string; tz: string } {
  const valid = (z: string | null | undefined): z is string => {
    if (!z) return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: z });
      return true;
    } catch {
      return false;
    }
  };
  const real = (z: string | null | undefined): z is string => valid(z) && z !== "UTC" && z !== "Etc/UTC";
  if (real(slotTz)) return { startTsUtc: new Date(slotStartTsUtc).toISOString(), tz: slotTz };
  if (real(seasonTz)) {
    // The wall time the slot shows in UTC, placed in the season's zone.
    const wall = new Date(slotStartTsUtc);
    const y = wall.getUTCFullYear(), mo = wall.getUTCMonth(), d = wall.getUTCDate();
    const h = wall.getUTCHours(), mi = wall.getUTCMinutes();
    const asUtc = Date.UTC(y, mo, d, h, mi);
    const offset = (t: number) => {
      const p = new Intl.DateTimeFormat("en-US", {
        timeZone: seasonTz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      }).formatToParts(new Date(t));
      const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
      return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - Math.floor(t / 60_000) * 60_000;
    };
    const first = asUtc - offset(asUtc);
    const second = asUtc - offset(first);
    return { startTsUtc: new Date(Math.min(first, second)).toISOString(), tz: seasonTz };
  }
  return { startTsUtc: new Date(slotStartTsUtc).toISOString(), tz: valid(slotTz) ? slotTz : "UTC" };
}
