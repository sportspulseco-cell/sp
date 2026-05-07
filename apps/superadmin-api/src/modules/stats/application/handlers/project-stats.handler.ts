import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  ApplicationError,
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
import { reducerForSport } from "../../domain/reducers/reducer";

export interface ProjectStatsInput {
  gameId: string;
  /** When true, allow projecting before finalization (e.g. live preview) */
  allowInProgress?: boolean;
}

export interface ProjectStatsOutput {
  gameId: string;
  linesWritten: number;
  sportCode: string;
}

// Read all events for a game, fold via the sport's reducer, upsert StatLines.
// Idempotent: re-running drops + re-inserts the lines for that game.
@Injectable()
export class ProjectStatsHandler
  implements CommandHandler<ProjectStatsInput, ProjectStatsOutput>
{
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  async execute(input: ProjectStatsInput): Promise<ProjectStatsOutput> {
    // Load the game (raw — staying out of the Game Operations module)
    const [game] = await this.db
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, input.gameId))
      .limit(1);
    if (!game) throw new NotFoundError("Game", input.gameId);

    if (!input.allowInProgress && game.status !== "completed") {
      throw new ApplicationError(
        "GAME_NOT_FINAL",
        "Stats projection requires game to be finalized (or pass allowInProgress=true)"
      );
    }

    // Post-flip: a league has many seasons. The game's season is
    // resolved from its division (division.seasonId). Falls back to
    // null when the game has no division attached.
    let resolvedSeasonId: string | null = null;
    if (game.divisionId) {
      const [div] = await this.db
        .select({ seasonId: schema.divisions.seasonId })
        .from(schema.divisions)
        .where(eq(schema.divisions.id, game.divisionId))
        .limit(1);
      resolvedSeasonId = div?.seasonId ?? null;
    }

    // Read events for this game in chronological order
    const events = await this.db
      .select()
      .from(schema.gameEvents)
      .where(eq(schema.gameEvents.gameId, input.gameId));
    events.sort((a, b) => a.tsUtc.getTime() - b.tsUtc.getTime());

    const reducer = reducerForSport(game.sportCode);
    const personStats = reducer.fold(
      events.map((e) => ({
        eventType: e.eventType,
        teamId: e.teamId,
        primaryPersonId: e.primaryPersonId,
        secondaryPersonIds: (e.secondaryPersonIds as string[]) ?? [],
        attributes: (e.attributes as Record<string, unknown>) ?? {}
      }))
    );

    // Wipe + reinsert (idempotent)
    await this.stats.deleteStatLinesForGame(input.gameId);
    if (personStats.length === 0) {
      return { gameId: input.gameId, linesWritten: 0, sportCode: game.sportCode };
    }

    await this.stats.upsertStatLines(
      personStats.map((p) => ({
        gameId: input.gameId,
        personId: p.personId,
        // Reducer carries last-known team; fall back to home team if missing
        teamId: p.teamId ?? game.homeTeamId,
        sportCode: game.sportCode,
        seasonId: resolvedSeasonId,
        leagueId: game.leagueId,
        divisionId: game.divisionId,
        gpIncrement: 1,
        core: p.core,
        extended: p.extended
      }))
    );

    return {
      gameId: input.gameId,
      linesWritten: personStats.length,
      sportCode: game.sportCode
    };
  }
}
