import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { NotificationService } from "../../communications/application/notification.service";

class RejectBodyDto {
  @IsString() @MinLength(10) reason!: string;
}

/**
 * Admin review screen — pending team applications.
 *
 * Per the spec: super_admin / org_admin / league_admin can act on
 * applications scoped to their reach. Currently we enforce super_admin
 * only via SuperAdminGuard; finer scoping is a follow-up once the
 * org_admin / league_admin role assignments are wired.
 */
@ApiTags("admin/applications")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminApplicationsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  // -------------------------------------------------------------------
  // GET /admin/divisions/:divisionId/teams
  // Teams currently registered (entry_status IN applied/accepted/confirmed)
  // in a given division. Per the spec: "If the team is approved, that
  // team should be listed under that division." Surfaces approved
  // entries on the admin's division detail page.
  // -------------------------------------------------------------------
  @Get("divisions/:divisionId/teams")
  @ApiOperation({
    summary:
      "Approved teams registered in this division (entry_status IN applied | accepted | confirmed)."
  })
  async listDivisionTeams(@Param("divisionId") divisionId: string) {
    const rows = await this.db
      .select({
        entryId: schema.divisionTeamEntries.id,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        appliedAt: schema.divisionTeamEntries.createdAt,
        thresholdCents:
          schema.divisionTeamEntries.confirmationThresholdCents,
        collectedCents: schema.divisionTeamEntries.collectedCents,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        teamShortName: schema.teams.shortName,
        teamColors: schema.teams.colors,
        captainUserId: schema.teams.captainUserId
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.divisionTeamEntries.teamId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.divisionId, divisionId),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      )
      .orderBy(desc(schema.divisionTeamEntries.createdAt));
    return {
      items: rows.map((r) => ({
        ...r,
        appliedAt: r.appliedAt.toISOString()
      }))
    };
  }

  @Get("seasons/:seasonId/applications")
  @ApiOperation({
    summary:
      "Pending team applications for a season. Lists every division_team_entries row with entry_status='pending_approval' under any division of this season."
  })
  async listForSeason(@Param("seasonId") seasonId: string) {
    const rows = await this.db
      .select({
        id: schema.divisionTeamEntries.id,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        createdAt: schema.divisionTeamEntries.createdAt,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        teamOrgId: schema.teams.orgId,
        captainUserId: schema.teams.captainUserId,
        divisionId: schema.divisions.id,
        divisionName: schema.divisions.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.divisionTeamEntries.teamId)
      )
      .where(
        and(
          eq(schema.divisions.seasonId, seasonId),
          eq(schema.divisionTeamEntries.entryStatus, "pending_approval")
        )
      )
      .orderBy(desc(schema.divisionTeamEntries.createdAt));
    return {
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    };
  }

  @Post("division-team-entries/:id/approve")
  @ApiOperation({
    summary:
      "Approve an application. Transitions entry_status pending_approval → applied. Captain is notified with a link to the rollover wizard for dues + roster setup."
  })
  async approve(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") entryId: string
  ) {
    const ctx = await this.loadEntry(entryId);
    if (ctx.entryStatus !== "pending_approval") {
      throw new ConflictException({
        error: "not_pending",
        message: `Application is in status=${ctx.entryStatus}; only pending_approval can be approved.`
      });
    }

    await this.db
      .update(schema.divisionTeamEntries)
      .set({ entryStatus: "applied" })
      .where(eq(schema.divisionTeamEntries.id, entryId));

    void this.notify.queue({
      orgId: ctx.orgId,
      templateCode: "TEAM_REGISTRATION_APPROVED",
      idempotencyKey: `app-approved-${entryId}`,
      payload: {
        teamName: ctx.teamName,
        divisionName: ctx.divisionName,
        seasonName: ctx.seasonName,
        entryId
      }
    });

    return { entryId, status: "applied" as const };
  }

  @Post("division-team-entries/:id/reject")
  @ApiOperation({
    summary:
      "Reject a pending_approval application. Reason is required (min 10 chars). Captain is notified with the reason and can re-apply to a different division. No invoices to void at this stage — the wizard hasn't run yet."
  })
  async reject(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") entryId: string,
    @Body() body: RejectBodyDto
  ) {
    const ctx = await this.loadEntry(entryId);
    if (ctx.entryStatus !== "pending_approval") {
      throw new ConflictException({
        error: "not_pending",
        message: `Application is in status=${ctx.entryStatus}.`
      });
    }

    const existingMetadata =
      (ctx.metadata as Record<string, unknown>) ?? {};
    await this.db
      .update(schema.divisionTeamEntries)
      .set({
        entryStatus: "rejected",
        metadata: {
          ...existingMetadata,
          rejectionReason: body.reason.trim(),
          rejectedAt: new Date().toISOString(),
          rejectedByUserId: user.userId
        }
      })
      .where(eq(schema.divisionTeamEntries.id, entryId));

    void this.notify.queue({
      orgId: ctx.orgId,
      templateCode: "TEAM_REGISTRATION_REJECTED",
      idempotencyKey: `app-rejected-${entryId}`,
      payload: {
        teamName: ctx.teamName,
        divisionName: ctx.divisionName,
        seasonName: ctx.seasonName,
        reason: body.reason.trim()
      }
    });

    return { entryId, status: "rejected" as const };
  }

  private async loadEntry(entryId: string) {
    const [row] = await this.db
      .select({
        id: schema.divisionTeamEntries.id,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        metadata: schema.divisionTeamEntries.metadata,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        orgId: schema.teams.orgId,
        divisionId: schema.divisions.id,
        divisionName: schema.divisions.name,
        seasonId: schema.divisions.seasonId,
        seasonName: schema.seasons.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.divisionTeamEntries.teamId)
      )
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .where(eq(schema.divisionTeamEntries.id, entryId))
      .limit(1);
    if (!row) throw new NotFoundException("Application not found");
    return row;
  }
}
