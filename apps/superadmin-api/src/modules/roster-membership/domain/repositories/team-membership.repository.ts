import type { Page, PageQuery } from "@sportspulse/kernel";
import type { TeamMembership } from "../entities/team-membership.entity";

export interface ListMembershipsQuery extends PageQuery {
  teamId?: string;
  personId?: string;
  seasonId?: string;
  activeOnly?: boolean;
  /**
   * When set, restricts results to memberships of teams that have an active
   * division entry in one of these leagues. Resolved via division_team_entries.
   */
  leagueIdsFilter?: string[];
}

export interface MembershipUpsert {
  teamId: string;
  personId: string;
  seasonId: string;
  membershipType: string;
  jerseyNumber: number | null;
  positionCode: string | null;
  effectiveFrom: Date;
  lastMoveId: string;
  currentStatus: string;
}

export interface TeamMembershipRepository {
  list(q: ListMembershipsQuery): Promise<Page<TeamMembership>>;
  findActive(
    teamId: string,
    personId: string,
    seasonId: string
  ): Promise<TeamMembership | null>;
  // Open a new active membership
  open(input: MembershipUpsert): Promise<void>;
  // Close the current active membership for (team, person, season)
  close(
    teamId: string,
    personId: string,
    seasonId: string,
    at: Date,
    lastMoveId: string,
    status: string
  ): Promise<void>;
}

export const TEAM_MEMBERSHIP_REPOSITORY = Symbol("TEAM_MEMBERSHIP_REPOSITORY");
