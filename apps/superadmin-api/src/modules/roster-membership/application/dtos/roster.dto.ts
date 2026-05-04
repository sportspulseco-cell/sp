import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { RosterMove } from "../../domain/entities/roster-move.entity";
import type { TeamMembership } from "../../domain/entities/team-membership.entity";
import {
  MEMBERSHIP_TYPES,
  MOVE_TYPES,
  MEMBERSHIP_STATUSES
} from "../../domain/value-objects/move-type.vo";

export class RosterMoveDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() personId!: string;
  @ApiProperty() seasonId!: string;
  @ApiProperty({ enum: MOVE_TYPES }) moveType!: (typeof MOVE_TYPES)[number];
  @ApiProperty({ enum: MEMBERSHIP_TYPES })
  membershipType!: (typeof MEMBERSHIP_TYPES)[number];
  @ApiProperty() effectiveAt!: string;
  @ApiPropertyOptional({ nullable: true }) effectiveTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) jerseyNumber!: number | null;
  @ApiPropertyOptional({ nullable: true }) positionCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) sourceEventId!: string | null;
  @ApiPropertyOptional({ nullable: true }) createdByUserId!: string | null;
  @ApiProperty() createdAt!: string;

  static fromDomain(m: RosterMove): RosterMoveDto {
    const x = m.toSnapshot();
    return {
      id: x.id,
      teamId: x.teamId,
      personId: x.personId,
      seasonId: x.seasonId,
      moveType: x.moveType,
      membershipType: x.membershipType,
      effectiveAt: x.effectiveAt.toISOString(),
      effectiveTo: x.effectiveTo?.toISOString() ?? null,
      jerseyNumber: x.jerseyNumber,
      positionCode: x.positionCode,
      reason: x.reason,
      sourceEventId: x.sourceEventId,
      createdByUserId: x.createdByUserId,
      createdAt: x.createdAt.toISOString()
    };
  }
}

export class RosterMovePageDto {
  @ApiProperty({ type: [RosterMoveDto] }) items!: RosterMoveDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class TeamMembershipDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() personId!: string;
  @ApiProperty() seasonId!: string;
  @ApiProperty({ enum: MEMBERSHIP_TYPES })
  membershipType!: (typeof MEMBERSHIP_TYPES)[number];
  @ApiProperty() effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true }) effectiveTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) jerseyNumber!: number | null;
  @ApiPropertyOptional({ nullable: true }) positionCode!: string | null;
  @ApiProperty({ enum: MEMBERSHIP_STATUSES })
  currentStatus!: (typeof MEMBERSHIP_STATUSES)[number];
  @ApiPropertyOptional({ nullable: true }) lastMoveId!: string | null;

  static fromDomain(t: TeamMembership): TeamMembershipDto {
    const x = t.toSnapshot();
    return {
      id: x.id,
      teamId: x.teamId,
      personId: x.personId,
      seasonId: x.seasonId,
      membershipType: x.membershipType,
      effectiveFrom: x.effectiveFrom.toISOString(),
      effectiveTo: x.effectiveTo?.toISOString() ?? null,
      jerseyNumber: x.jerseyNumber,
      positionCode: x.positionCode,
      currentStatus: x.currentStatus,
      lastMoveId: x.lastMoveId
    };
  }
}

export class TeamMembershipPageDto {
  @ApiProperty({ type: [TeamMembershipDto] }) items!: TeamMembershipDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
