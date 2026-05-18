import type { Page, PageQuery } from "@sportspulse/kernel";
import type { RosterMove } from "../entities/roster-move.entity";
import { RosterMoveId } from "../identifiers";

export interface ListRosterMovesQuery extends PageQuery {
  teamId?: string;
  personId?: string;
  seasonId?: string;
  moveType?: string;
  /**
   * Scope whitelists, union'd: a move is in scope when its
   * team_id resolves to a team where (team.org_id ∈ orgIdsFilter)
   * OR (team.id ∈ teamIdsFilter)
   * OR (team has active DTE under a league in leagueIdsFilter).
   * Mirrors the teams list scope contract. Empty arrays mean
   * zero-visibility on that dimension; undefined means unrestricted.
   */
  leagueIdsFilter?: string[];
  orgIdsFilter?: string[];
  teamIdsFilter?: string[];
}

export interface RosterMoveRepository {
  findById(id: RosterMoveId): Promise<RosterMove | null>;
  findBySourceEventId(sourceEventId: string): Promise<RosterMove | null>;
  /**
   * Returns the move's parent team's org_id (and team_id, redundantly)
   * for the scope check on getOne. `null` when the move doesn't exist.
   */
  loadScopeContext(
    id: RosterMoveId
  ): Promise<{ teamId: string; orgId: string } | null>;
  /**
   * True if the given team has an active DTE under any of the supplied
   * leagues. Used by the GetRosterMove scope check to reach moves via
   * the league-scope branch.
   */
  teamReachableViaLeagues(
    teamId: string,
    leagueIds: string[]
  ): Promise<boolean>;
  list(q: ListRosterMovesQuery): Promise<Page<RosterMove>>;
  insert(move: RosterMove): Promise<void>;
  // Used by snapshot queries — all moves for a (team, season) up to a timestamp
  listForProjection(
    teamId: string,
    seasonId: string,
    asOf?: Date
  ): Promise<RosterMove[]>;
}

export const ROSTER_MOVE_REPOSITORY = Symbol("ROSTER_MOVE_REPOSITORY");
