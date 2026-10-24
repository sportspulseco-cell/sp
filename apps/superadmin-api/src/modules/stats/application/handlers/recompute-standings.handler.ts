import { Inject, Injectable } from "@nestjs/common";
import { type CommandHandler } from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { recomputeLeagueStandings } from "../projections";

export interface RecomputeStandingsInput {
  leagueId: string;
  /**
   * Points-per-result override. Default (kernel DEFAULT_POINTS_RULE):
   * win 2, OT/SO win 2, loss 0, OT/SO loss 1, tie 1. No division stores
   * its own rule yet.
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

/**
 * Manual "Recompute" (and team movement). One transaction with a
 * per-league lock, so a failure never leaves the league half-written and
 * concurrent recomputes cannot interleave. Finalize runs the same code.
 */
@Injectable()
export class RecomputeStandingsHandler
  implements CommandHandler<RecomputeStandingsInput, RecomputeStandingsOutput>
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async execute(input: RecomputeStandingsInput): Promise<RecomputeStandingsOutput> {
    const r = await this.db.transaction((tx) =>
      recomputeLeagueStandings(tx, input.leagueId, {
        win: input.ppw,
        overtimeWin: input.ppw,
        loss: input.ppl,
        tie: input.ppt,
        overtimeLoss: input.ppotl
      })
    );
    return { leagueId: r.leagueId, teamsRanked: r.teamsRanked };
  }
}
