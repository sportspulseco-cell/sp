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
   *
   * Used together with `orgIdsFilter`: a team is included if it matches
   * EITHER (a team's org is in the org whitelist OR it has an active
   * DTE under a league in this whitelist). Org admins use this to see
   * orphan teams in their orgs.
   */
  leagueIdsFilter?: string[];
  /** Org-scope whitelist; union'd with `leagueIdsFilter` (see above). */
  orgIdsFilter?: string[];
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
