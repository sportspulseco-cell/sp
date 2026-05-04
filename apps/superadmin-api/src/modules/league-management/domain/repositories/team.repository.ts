import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Team } from "../entities/team.entity";
import { TeamId } from "../identifiers";

export interface ListTeamsQuery extends PageQuery {
  orgId?: string;
  sportCode?: string;
  status?: string;
  search?: string;
  /**
   * When set, restricts results to teams that have an active entry in a
   * division of one of these leagues. Resolved via division_team_entries.
   */
  leagueIdsFilter?: string[];
}

export interface TeamRepository {
  findById(id: TeamId): Promise<Team | null>;
  /** True if the team has an active division_team_entry in one of the leagues. */
  existsInLeagues(id: TeamId, leagueIds: string[]): Promise<boolean>;
  list(q: ListTeamsQuery): Promise<Page<Team>>;
  insert(team: Team): Promise<void>;
  save(team: Team): Promise<void>;
  delete(id: TeamId): Promise<void>;
}

export const TEAM_REPOSITORY = Symbol("TEAM_REPOSITORY");
