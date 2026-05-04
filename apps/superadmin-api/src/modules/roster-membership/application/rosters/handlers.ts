import { Inject, Injectable } from "@nestjs/common";
import { clampLimit, type QueryHandler } from "@sportspulse/kernel";
import {
  TEAM_MEMBERSHIP_REPOSITORY,
  type TeamMembershipRepository
} from "../../domain/repositories/team-membership.repository";
import {
  ROSTER_MOVE_REPOSITORY,
  type RosterMoveRepository
} from "../../domain/repositories/roster-move.repository";
import {
  TeamMembershipDto,
  TeamMembershipPageDto
} from "../dtos/roster.dto";
import {
  isAddingMove,
  isTerminatingMove
} from "../../domain/value-objects/move-type.vo";

export interface ListMembershipsInput {
  limit?: number;
  cursor?: string;
  teamId?: string;
  personId?: string;
  seasonId?: string;
  activeOnly?: boolean;
  leagueIdsFilter?: string[];
}

@Injectable()
export class ListMembershipsHandler
  implements QueryHandler<ListMembershipsInput, TeamMembershipPageDto>
{
  constructor(
    @Inject(TEAM_MEMBERSHIP_REPOSITORY)
    private readonly memberships: TeamMembershipRepository
  ) {}
  async execute(input: ListMembershipsInput): Promise<TeamMembershipPageDto> {
    if (input.leagueIdsFilter && input.leagueIdsFilter.length === 0) {
      return { items: [], nextCursor: null };
    }
    const page = await this.memberships.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(TeamMembershipDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

export interface RosterSnapshotInput {
  teamId: string;
  seasonId: string;
  asOf?: string; // ISO date or timestamp
}

export interface SnapshotEntry {
  personId: string;
  membershipType: string;
  jerseyNumber: number | null;
  positionCode: string | null;
  effectiveFrom: string;
  lastMoveId: string;
}

@Injectable()
export class RosterSnapshotHandler
  implements QueryHandler<RosterSnapshotInput, { items: SnapshotEntry[]; asOf: string }>
{
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository
  ) {}

  async execute(input: RosterSnapshotInput) {
    const asOf = input.asOf ? new Date(input.asOf) : new Date();
    const moves = await this.moves.listForProjection(
      input.teamId,
      input.seasonId,
      asOf
    );

    // Pure projection — replay events into a per-person current state map.
    const current = new Map<string, SnapshotEntry>();
    for (const m of moves) {
      const x = m.toSnapshot();
      if (isAddingMove(x.moveType)) {
        current.set(x.personId, {
          personId: x.personId,
          membershipType: x.membershipType,
          jerseyNumber: x.jerseyNumber,
          positionCode: x.positionCode,
          effectiveFrom: x.effectiveAt.toISOString(),
          lastMoveId: x.id
        });
      } else if (isTerminatingMove(x.moveType)) {
        current.delete(x.personId);
      }
    }

    return {
      items: Array.from(current.values()),
      asOf: asOf.toISOString()
    };
  }
}
