import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Division } from "../entities/division.entity";
import { DivisionId } from "../identifiers";

export interface ListDivisionsQuery extends PageQuery {
  /** Post-flip — divisions live under seasons. */
  seasonId?: string;
  status?: string;
  search?: string;
  /**
   * When set, restricts results to divisions whose ancestor LEAGUE id
   * is in this list. The repo joins divisions → seasons → leagues.
   */
  leagueIdsFilter?: string[];
}

export interface DivisionRepository {
  findById(id: DivisionId): Promise<Division | null>;
  list(q: ListDivisionsQuery): Promise<Page<Division>>;
  insert(division: Division): Promise<void>;
  save(division: Division): Promise<void>;
  delete(id: DivisionId): Promise<void>;
}

export const DIVISION_REPOSITORY = Symbol("DIVISION_REPOSITORY");
