import type { Page, PageQuery } from "@sportspulse/kernel";
import type { RosterMove } from "../entities/roster-move.entity";
import { RosterMoveId } from "../identifiers";

export interface ListRosterMovesQuery extends PageQuery {
  teamId?: string;
  personId?: string;
  seasonId?: string;
  moveType?: string;
}

export interface RosterMoveRepository {
  findById(id: RosterMoveId): Promise<RosterMove | null>;
  findBySourceEventId(sourceEventId: string): Promise<RosterMove | null>;
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
