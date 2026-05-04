import type { Page, PageQuery } from "@sportspulse/kernel";
import type { GameEvent } from "../entities/game-event.entity";
import { GameEventId } from "../identifiers";

export interface ListGameEventsQuery extends PageQuery {
  gameId?: string;
  eventType?: string;
  primaryPersonId?: string;
}

export interface GameEventRepository {
  findById(id: GameEventId): Promise<GameEvent | null>;
  findByIdempotencyKey(key: string): Promise<GameEvent | null>;
  listForGame(gameId: string): Promise<GameEvent[]>;
  list(q: ListGameEventsQuery): Promise<Page<GameEvent>>;
  insert(event: GameEvent): Promise<void>;
}

export const GAME_EVENT_REPOSITORY = Symbol("GAME_EVENT_REPOSITORY");
