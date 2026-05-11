import {
  Controller,
  Get,
  Inject,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";

class NoShowQueryDto {
  @IsUUID() lastSeasonId!: string;
  @IsUUID() newSeasonId!: string;
}

/**
 * Workflow 7B · Case 10 — teams that played last season but have no
 * division_team_entries row for the new season. Surfaced as an admin
 * "no-show report" after the new season's registration closes.
 */
@ApiTags("league/admin/reports")
@ApiBearerAuth()
@Controller("league/reports")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class NoShowReportController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get("no-show")
  @ApiOperation({
    summary:
      "Teams active in `lastSeasonId` that have not entered any division in `newSeasonId`. Returns team_id, name, captain email, and the last season's division for outreach."
  })
  async report(@Query() q: NoShowQueryDto) {
    // Last-season DTE rows for currently-active teams.
    const lastSeasonRows = await this.db
      .select({
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        teamStatus: schema.teams.status,
        captainUserId: schema.teams.captainUserId,
        lastDivisionId: schema.divisionTeamEntries.divisionId,
        lastDivisionName: schema.divisions.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(schema.teams, eq(schema.teams.id, schema.divisionTeamEntries.teamId))
      .where(
        and(
          eq(schema.divisions.seasonId, q.lastSeasonId),
          eq(schema.teams.status, "active"),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "confirmed",
            "accepted",
            "applied"
          ])
        )
      );

    if (lastSeasonRows.length === 0) return { items: [] };

    // Anyone with a DTE in the new season's divisions is NOT a no-show.
    const newSeasonTeamIds = await this.db
      .select({ teamId: schema.divisionTeamEntries.teamId })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(eq(schema.divisions.seasonId, q.newSeasonId));
    const inNew = new Set(newSeasonTeamIds.map((r) => r.teamId));

    const missing = lastSeasonRows.filter((r) => !inNew.has(r.teamId));
    if (missing.length === 0) return { items: [] };

    const captainUserIds = missing
      .map((r) => r.captainUserId)
      .filter((u): u is string => !!u);
    const captainProfiles = captainUserIds.length
      ? await this.db
          .select({
            userId: schema.profiles.id,
            email: schema.profiles.email,
            firstName: schema.profiles.legalFirstName,
            lastName: schema.profiles.legalLastName
          })
          .from(schema.profiles)
          .where(inArray(schema.profiles.id, captainUserIds))
      : [];
    const byUser = new Map(
      captainProfiles.map((p) => [p.userId, p])
    );

    return {
      items: missing.map((m) => {
        const captain = m.captainUserId ? byUser.get(m.captainUserId) : null;
        return {
          teamId: m.teamId,
          teamName: m.teamName,
          lastDivisionId: m.lastDivisionId,
          lastDivisionName: m.lastDivisionName,
          captainEmail: captain?.email ?? null,
          captainName: captain
            ? [captain.firstName, captain.lastName].filter(Boolean).join(" ")
            : null
        };
      })
    };
  }
}
