import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Team } from "../../domain/entities/team.entity";

export class TeamDto {
  @ApiProperty() id!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) shortName!: string | null;
  @ApiProperty() sportCode!: string;
  @ApiPropertyOptional({ nullable: true }) logoUrl!: string | null;
  @ApiProperty({ enum: ["active", "dissolved"] }) status!: "active" | "dissolved";
  /** Workflow 7A — denormalised current captain (sync of user_role_assignments). */
  @ApiPropertyOptional({ nullable: true }) captainUserId!: string | null;
  /** Workflow 7A — cents threshold for DTE auto-confirm. 0 = auto. */
  @ApiProperty() confirmationThresholdCents!: number;
  /** Stored under externalIds.homeRink (jsonb scratch). */
  @ApiPropertyOptional({ nullable: true }) homeRink!: string | null;
  /** Team brand colours: { primary?, secondary? }. */
  @ApiPropertyOptional() colors!: Record<string, unknown>;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(t: Team): TeamDto {
    const x = t.toSnapshot();
    return {
      id: x.id,
      orgId: x.orgId,
      name: x.name,
      shortName: x.shortName,
      sportCode: x.sportCode,
      logoUrl: x.logoUrl,
      status: x.status,
      // Default values for the workflow-7A fields. The controller
      // enriches these via Drizzle when it has the latest row.
      captainUserId: null,
      confirmationThresholdCents: 0,
      homeRink: null,
      colors: (x as { colors?: Record<string, unknown> }).colors ?? {},
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class TeamPageDto {
  @ApiProperty({ type: [TeamDto] }) items!: TeamDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
