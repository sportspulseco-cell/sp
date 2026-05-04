import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  GAME_EVENT_REPOSITORY,
  type GameEventRepository
} from "../../domain/repositories/game-event.repository";
import {
  GAME_REPOSITORY,
  type GameRepository
} from "../../domain/repositories/game.repository";
import { GameEventId, GameId } from "../../domain/identifiers";
import {
  GameEvent,
  type EventSource
} from "../../domain/entities/game-event.entity";
import { GameEventDto, GameEventPageDto } from "../dtos/game.dto";

export interface AppendEventInput {
  gameId: string;
  eventType: string;
  tsUtc?: string;
  period?: number | null;
  clockRemainingSec?: number | null;
  teamId?: string | null;
  primaryPersonId?: string | null;
  secondaryPersonIds?: string[];
  attributes?: Record<string, unknown>;
  source?: EventSource;
  sourceDeviceId?: string | null;
  idempotencyKey?: string | null;
  correctionOfEventId?: string | null;
  loggedByUserId?: string | null;
}

@Injectable()
export class AppendEventHandler
  implements CommandHandler<AppendEventInput, GameEventDto>
{
  constructor(
    @Inject(GAME_EVENT_REPOSITORY) private readonly events: GameEventRepository,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository
  ) {}
  async execute(input: AppendEventInput): Promise<GameEventDto> {
    if (input.idempotencyKey) {
      const existing = await this.events.findByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return GameEventDto.fromDomain(existing);
    }
    const game = await this.games.findById(GameId.of(input.gameId));
    if (!game) throw new NotFoundError("Game", input.gameId);

    const event = GameEvent.create({
      id: GameEventId.of(randomUUID()),
      gameId: input.gameId,
      sportCode: game.sportCode,
      eventType: input.eventType,
      tsUtc: input.tsUtc ? new Date(input.tsUtc) : undefined,
      period: input.period,
      clockRemainingSec: input.clockRemainingSec,
      teamId: input.teamId,
      primaryPersonId: input.primaryPersonId,
      secondaryPersonIds: input.secondaryPersonIds,
      attributes: input.attributes,
      source: input.source,
      sourceDeviceId: input.sourceDeviceId,
      idempotencyKey: input.idempotencyKey,
      correctionOfEventId: input.correctionOfEventId,
      loggedByUserId: input.loggedByUserId
    });
    await this.events.insert(event);
    return GameEventDto.fromDomain(event);
  }
}

export interface ListEventsInput {
  limit?: number;
  cursor?: string;
  gameId?: string;
  eventType?: string;
  primaryPersonId?: string;
}

@Injectable()
export class ListEventsHandler
  implements QueryHandler<ListEventsInput, GameEventPageDto>
{
  constructor(
    @Inject(GAME_EVENT_REPOSITORY) private readonly events: GameEventRepository
  ) {}
  async execute(input: ListEventsInput): Promise<GameEventPageDto> {
    const page = await this.events.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(GameEventDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class ListGameEventsHandler
  implements QueryHandler<{ gameId: string }, GameEventDto[]>
{
  constructor(
    @Inject(GAME_EVENT_REPOSITORY) private readonly events: GameEventRepository
  ) {}
  async execute(input: { gameId: string }): Promise<GameEventDto[]> {
    const items = await this.events.listForGame(input.gameId);
    return items.map(GameEventDto.fromDomain);
  }
}
