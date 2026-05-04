import type { Page, PageQuery } from "@sportspulse/kernel";
import type { League } from "../entities/league.entity";
import { LeagueId } from "../identifiers";

export interface ListLeaguesQuery extends PageQuery {
  seasonId?: string;
  sportCode?: string;
  status?: string;
  search?: string;
  /** When set, restricts results to leagues whose id is in this list. */
  leagueIdsFilter?: string[];
}

export interface LeagueRepository {
  findById(id: LeagueId): Promise<League | null>;
  list(q: ListLeaguesQuery): Promise<Page<League>>;
  insert(league: League): Promise<void>;
  save(league: League): Promise<void>;
  delete(id: LeagueId): Promise<void>;
}

export const LEAGUE_REPOSITORY = Symbol("LEAGUE_REPOSITORY");
