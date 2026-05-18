import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Season } from "../entities/season.entity";
import { SeasonId } from "../identifiers";

export interface ListSeasonsQuery extends PageQuery {
  /** Primary post-flip filter — seasons live under a league. */
  leagueId?: string;
  /** Convenience — seasons.orgId is denormalised. */
  orgId?: string;
  sportCode?: string;
  status?: string;
  search?: string;
  /** Scope whitelist (union'd): league_id ∈ leagueIdsFilter OR org_id ∈ orgIdsFilter. */
  leagueIdsFilter?: string[];
  orgIdsFilter?: string[];
}

export interface SeasonRepository {
  findById(id: SeasonId): Promise<Season | null>;
  list(q: ListSeasonsQuery): Promise<Page<Season>>;
  insert(season: Season): Promise<void>;
  save(season: Season): Promise<void>;
  delete(id: SeasonId): Promise<void>;
}

export const SEASON_REPOSITORY = Symbol("SEASON_REPOSITORY");
