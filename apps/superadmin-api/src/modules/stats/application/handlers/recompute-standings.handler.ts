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

    const tallies = new Map<string, Tally>();
    const init = (teamId: string, divisionId: string | null): Tally => {
      let t = tallies.get(teamId);
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
        tallies.set(teamId, t);
      }
      if (divisionId) t.divisionId = divisionId;
      return t;
    };

    for (const g of games) {
      if (g.status !== "completed" && g.status !== "forfeited") continue;
      const home = init(g.homeTeamId, g.divisionId);
      const away = init(g.awayTeamId, g.divisionId);
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
