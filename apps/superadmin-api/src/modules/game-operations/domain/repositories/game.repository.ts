import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Game } from "../entities/game.entity";
import { GameId } from "../identifiers";

export interface ListGamesQuery extends PageQuery {
  leagueId?: string;
  divisionId?: string;
  teamId?: string;
  status?: string;
  fromTs?: Date;
  toTs?: Date;
  /** When set, restricts results to games whose leagueId is in this list. */
  leagueIdsFilter?: string[];
}

export interface GameRepository {
  findById(id: GameId): Promise<Game | null>;
  list(q: ListGamesQuery): Promise<Page<Game>>;
  insert(game: Game): Promise<void>;
  save(game: Game): Promise<void>;
}

export const GAME_REPOSITORY = Symbol("GAME_REPOSITORY");
