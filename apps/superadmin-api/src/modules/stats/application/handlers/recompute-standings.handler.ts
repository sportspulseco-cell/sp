import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  NotFoundError,
  type CommandHandler
} from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import {
  STATS_REPOSITORY,
  type StatsRepository
} from "../../domain/repositories/stats.repository";

export interface RecomputeStandingsInput {
  leagueId: string;
  /**
   * Points-per-result. Default hockey: win 2, OT win 2, loss 0, OT loss 1, tie 1.
   * Override via league rule-set later.
   */
  ppw?: number;
  ppl?: number;
  ppt?: number;
  ppotl?: number;
}

export interface RecomputeStandingsOutput {
  leagueId: string;
  teamsRanked: number;
}

interface Tally {
  teamId: string;
  divisionId: string | null;
  gp: number;
  w: number;
  l: number;
  t: number;
  otl: number;
  gf: number;
  ga: number;
  points: number;
}

@Injectable()
export class RecomputeStandingsHandler
  implements CommandHandler<RecomputeStandingsInput, RecomputeStandingsOutput>
{
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  async execute(input: RecomputeStandingsInput): Promise<RecomputeStandingsOutput> {
    const ppw = input.ppw ?? 2;
    const ppl = input.ppl ?? 0;
    const ppt = input.ppt ?? 1;
    const ppotl = input.ppotl ?? 1;

    const [league] = await this.db
      .select()
      .from(schema.leagues)
      .where(eq(schema.leagues.id, input.leagueId))
      .limit(1);
    if (!league) throw new NotFoundError("League", input.leagueId);

    // Pull all completed/forfeited games for the league
    const games = await this.db
      .select()
      .from(schema.games)
      .where(
        and(
          eq(schema.games.leagueId, input.leagueId),
          ne(schema.games.status, "scheduled")
        )
      );

    // Mid-season division shift without a reset (0052): games the team
    // played under its previous instance count toward the division it
    // now plays in. Map (team, old division) -> new division, following
    // chains of shifts.
    const carried = await this.db
      .select({
        teamId: schema.divisionTeamEntries.teamId,
        toDivisionId: schema.divisionTeamEntries.divisionId,
        fromDivisionId: sql<string>`prev.division_id`
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        sql`division_team_entries prev`,
        sql`prev.id = ${schema.divisionTeamEntries.previousEntryId}`
      )
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(
        and(
          eq(schema.seasons.leagueId, input.leagueId),
          eq(schema.divisionTeamEntries.carryStandings, true),
          sql`${schema.divisionTeamEntries.entryStatus} NOT IN ('rejected','withdrawn','disqualified','moved')`
        )
      );
    const remap = new Map<string, string>();
    for (const c of carried) remap.set(`${c.teamId}:${c.fromDivisionId}`, c.toDivisionId);
    const divisionFor = (teamId: string, divisionId: string | null): string | null => {
      let d = divisionId;
      for (let hops = 0; d && hops < 10; hops++) {
        const next = remap.get(`${teamId}:${d}`);
        if (!next || next === d) break;
        d = next;
      }
      return d;
    };

    // One tally per (division, team). The previous version keyed by team
    // only and overwrote the division with the last game's, so a team's
    // record mixed seasons and divisions.
    const tallies = new Map<string, Tally>();
    const init = (teamId: string, divisionId: string | null): Tally => {
      const key = `${divisionId ?? "_league_"}:${teamId}`;
      let t = tallies.get(key);
      if (!t) {
        t = {
          teamId,
          divisionId,
          gp: 0,
          w: 0,
          l: 0,
          t: 0,
          otl: 0,
          gf: 0,
          ga: 0,
          points: 0
        };
        tallies.set(key, t);
      }
      return t;
    };

    for (const g of games) {
      if (g.status !== "completed" && g.status !== "forfeited") continue;
      const home = init(g.homeTeamId, divisionFor(g.homeTeamId, g.divisionId));
      const away = init(g.awayTeamId, divisionFor(g.awayTeamId, g.divisionId));
      home.gp += 1;
      away.gp += 1;
      home.gf += g.homeScore;
      home.ga += g.awayScore;
      away.gf += g.awayScore;
      away.ga += g.homeScore;
      if (g.homeScore > g.awayScore) {
        home.w += 1;
        home.points += ppw;
        away.l += 1;
        away.points += ppl;
      } else if (g.awayScore > g.homeScore) {
        away.w += 1;
        away.points += ppw;
        home.l += 1;
        home.points += ppl;
      } else {
        home.t += 1;
        away.t += 1;
        home.points += ppt;
        away.points += ppt;
      }
    }

    // Bucket by division for ranking
    const buckets = new Map<string, Tally[]>();
    for (const t of tallies.values()) {
      const key = t.divisionId ?? "_league_";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(t);
    }
    for (const arr of buckets.values()) {
      arr.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const aGd = a.gf - a.ga;
        const bGd = b.gf - b.ga;
        if (bGd !== aGd) return bGd - aGd;
        return b.gf - a.gf;
      });
    }

    // Persist
    await this.stats.deleteStandingsForLeague(input.leagueId);
    for (const arr of buckets.values()) {
      let rank = 0;
      for (const t of arr) {
        rank += 1;
        await this.stats.upsertStanding({
          leagueId: input.leagueId,
          divisionId: t.divisionId,
          teamId: t.teamId,
          gp: t.gp,
          w: t.w,
          l: t.l,
          t: t.t,
          otl: t.otl,
          points: t.points,
          gf: t.gf,
          ga: t.ga,
          gd: t.gf - t.ga,
          rank,
          tiebreakers: { method: "points,gd,gf" }
        });
      }
    }

    return {
      leagueId: input.leagueId,
      teamsRanked: tallies.size
    };
  }
}
