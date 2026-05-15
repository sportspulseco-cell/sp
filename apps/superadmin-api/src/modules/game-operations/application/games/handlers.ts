import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  GAME_REPOSITORY,
  type GameRepository
} from "../../domain/repositories/game.repository";
import { GameId } from "../../domain/identifiers";
import { Game } from "../../domain/entities/game.entity";
import { GameDto, GamePageDto } from "../dtos/game.dto";
import { NotificationService } from "../../../communications/application/notification.service";
import { DRIZZLE } from "../../../../shared/database/database.tokens";

export interface ListGamesInput {
  limit?: number;
  cursor?: string;
  leagueId?: string;
  divisionId?: string;
  teamId?: string;
  status?: string;
  fromTs?: string;
  toTs?: string;
  leagueIdsFilter?: string[];
}

@Injectable()
export class ListGamesHandler
  implements QueryHandler<ListGamesInput, GamePageDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: ListGamesInput): Promise<GamePageDto> {
    if (input.leagueIdsFilter && input.leagueIdsFilter.length === 0) {
      return { items: [], nextCursor: null };
    }
    const page = await this.games.list({
      ...input,
      limit: clampLimit(input.limit),
      fromTs: input.fromTs ? new Date(input.fromTs) : undefined,
      toTs: input.toTs ? new Date(input.toTs) : undefined
    });
    return {
      items: page.items.map(GameDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetGameHandler
  implements QueryHandler<{ id: string; leagueIdsFilter?: string[] }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: { id: string; leagueIdsFilter?: string[] }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    if (input.leagueIdsFilter && !input.leagueIdsFilter.includes(g.leagueId)) {
      throw new NotFoundError("Game", input.id);
    }
    return GameDto.fromDomain(g);
  }
}

export interface CreateGameInput {
  leagueId: string;
  divisionId?: string | null;
  homeTeamId: string;
  awayTeamId: string;
  sportCode: string;
  scheduledStartTsUtc: string;
  tz?: string;
  durationMin?: number;
  venueName?: string | null;
  surfaceLabel?: string | null;
}

@Injectable()
export class CreateGameHandler
  implements CommandHandler<CreateGameInput, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: CreateGameInput): Promise<GameDto> {
    const g = Game.create({
      id: GameId.of(randomUUID()),
      leagueId: input.leagueId,
      divisionId: input.divisionId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      sportCode: input.sportCode,
      scheduledStartTsUtc: new Date(input.scheduledStartTsUtc),
      tz: input.tz,
      durationMin: input.durationMin,
      venueName: input.venueName,
      surfaceLabel: input.surfaceLabel
    });
    await this.games.insert(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class StartPlayHandler
  implements CommandHandler<{ id: string }, GameDto>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}
  async execute(input: { id: string }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.startPlay();
    await this.games.save(g);

    // Lock both teams' lineups the moment the game starts play
    // (Backlog #5 — captain edits 409 past this point). Idempotent —
    // only sets locked_at on rows where it's still null.
    await this.db
      .update(schema.gameLineups)
      .set({ lockedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.gameLineups.gameId, input.id),
          isNull(schema.gameLineups.lockedAt)
        )
      );

    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class ApplyScoreHandler
  implements
    CommandHandler<
      { id: string; home: number; away: number; period?: number },
      GameDto
    >
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: {
    id: string;
    home: number;
    away: number;
    period?: number;
  }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.applyScore(input.home, input.away, input.period);
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class PostponeGameHandler
  implements CommandHandler<{ id: string }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: { id: string }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.postpone();
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class CancelGameHandler
  implements CommandHandler<{ id: string }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: { id: string }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.cancel();
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class ForfeitGameHandler
  implements
    CommandHandler<{ id: string; winningTeamId: string }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: {
    id: string;
    winningTeamId: string;
  }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.forfeit(input.winningTeamId);
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class FinalizeGameHandler
  implements CommandHandler<{ id: string; userId: string }, GameDto>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    private readonly notify: NotificationService
  ) {}
  async execute(input: { id: string; userId: string }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.finalize(input.userId);
    await this.games.save(g);

    const x = g.toSnapshot();
    await this.notify.queue({
      templateCode: "game.finalized",
      idempotencyKey: `game.finalized:${x.id}:${x.finalizedAt?.toISOString() ?? ""}`,
      payload: {
        homeTeam: x.homeTeamId.slice(0, 8),
        awayTeam: x.awayTeamId.slice(0, 8),
        homeScore: x.homeScore,
        awayScore: x.awayScore
      },
      sourceEvent: "game.finalized"
    });

    return GameDto.fromDomain(g);
  }
}
