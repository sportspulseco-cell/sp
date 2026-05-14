import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../../shared/auth/guards/roles.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { Roles } from "../../../shared/auth/decorators/roles.decorator";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { NotificationService } from "../../communications/application/notification.service";

class RejectBodyDto {
  @IsString() @MinLength(10) reason!: string;
}

/**
 * Admin review — pending team applications.
 *
 * Per spec: super_admin / org_admin / league_admin can act on
 * applications scoped to their reach. RolesGuard enforces role
 * membership; row-level scope (league whitelist projected from
 * org-scoped assignments) is checked inside each handler against the
 * entry's season.leagueId. Out-of-scope reads return empty + writes
 * raise 404 so we never leak existence across orgs.
 */
@ApiTags("admin/applications")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard, AuthorizedAccessGuard)
@Roles("super_admin", "org_admin", "league_admin")
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
  async listDivisionTeams(
    @Param("divisionId") divisionId: string,
    @UserScope() scope: UserScopeType
  ) {
    const [div] = await this.db
      .select({
        id: schema.divisions.id,
        seasonId: schema.divisions.seasonId,
        leagueId: schema.seasons.leagueId
      })
      .from(schema.divisions)
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .where(eq(schema.divisions.id, divisionId))
      .limit(1);
    if (!div) throw new NotFoundException("Division not found");
    this.ensureLeagueInScope(scope, div.leagueId);

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
      "Team applications for a season. Defaults to entry_status='pending_approval'. Pass ?status=all to include approved/rejected/withdrawn (powers the queue filter)."
  })
  async listForSeason(
    @Param("seasonId") seasonId: string,
    @UserScope() scope: UserScopeType,
    @Query("status") status?: string
  ) {
    // Resolve season header + every division (for the filter dropdown
    // and capacity-aware Approve disabling — mock 4).
    const [season] = await this.db
      .select({
        id: schema.seasons.id,
        name: schema.seasons.name,
        leagueId: schema.seasons.leagueId,
        registrationClosesAt: schema.seasons.registrationClosesAt
      })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");
    this.ensureLeagueInScope(scope, season.leagueId);

    const divisions = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        maxTeams: schema.divisions.maxTeams
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.seasonId, seasonId));

    // Per-division current count — anything not withdrawn/rejected.
    // Used both for the capacity badge AND to disable Approve when the
    // application's division is already full.
    const counts = divisions.length
      ? await this.db
          .select({
            divisionId: schema.divisionTeamEntries.divisionId,
            count: sql<number>`COUNT(*)::int`
          })
          .from(schema.divisionTeamEntries)
          .where(
            and(
              inArray(
                schema.divisionTeamEntries.divisionId,
                divisions.map((d) => d.id)
              ),
              sql`${schema.divisionTeamEntries.entryStatus} NOT IN ('withdrawn','rejected','disqualified')`
            )
          )
          .groupBy(schema.divisionTeamEntries.divisionId)
      : [];
    const countByDiv = new Map(counts.map((c) => [c.divisionId, c.count]));

    // Status filter — default to pending only, "all" returns everything
    // except hard-cancel states the admin shouldn't act on.
    const statusFilter =
      status === "all"
        ? inArray(schema.divisionTeamEntries.entryStatus, [
            "pending_approval",
            "applied",
            "accepted",
            "confirmed",
            "rejected",
            "withdrawn"
          ])
        : status === "approved"
          ? inArray(schema.divisionTeamEntries.entryStatus, [
              "applied",
              "accepted",
              "confirmed"
            ])
          : status === "rejected"
            ? eq(schema.divisionTeamEntries.entryStatus, "rejected")
            : eq(schema.divisionTeamEntries.entryStatus, "pending_approval");

    const rows = await this.db
      .select({
        id: schema.divisionTeamEntries.id,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        createdAt: schema.divisionTeamEntries.createdAt,
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        teamShortName: schema.teams.shortName,
        teamColors: schema.teams.colors,
        teamOrgId: schema.teams.orgId,
        captainUserId: schema.teams.captainUserId,
        captainDisplayName: schema.profiles.displayName,
        captainFirstName: schema.profiles.legalFirstName,
        captainLastName: schema.profiles.legalLastName,
        captainPreferredName: schema.profiles.preferredName,
        captainEmail: schema.profiles.email,
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
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.teams.captainUserId)
      )
      .where(and(eq(schema.divisions.seasonId, seasonId), statusFilter))
      .orderBy(desc(schema.divisionTeamEntries.createdAt));

    return {
      season: {
        id: season.id,
        name: season.name,
        registrationClosesAt:
          season.registrationClosesAt?.toISOString() ?? null
      },
      divisions: divisions.map((d) => ({
        id: d.id,
        name: d.name,
        maxTeams: d.maxTeams ?? null,
        currentTeamCount: countByDiv.get(d.id) ?? 0
      })),
      items: rows.map((r) => {
        const max = divisions.find((d) => d.id === r.divisionId)?.maxTeams ?? null;
        const current = countByDiv.get(r.divisionId) ?? 0;
        const fullName = [r.captainFirstName, r.captainLastName]
          .filter((x): x is string => !!x)
          .join(" ");
        const captainName =
          r.captainPreferredName ||
          r.captainDisplayName ||
          (fullName || null);
        return {
          id: r.id,
          entryStatus: r.entryStatus,
          createdAt: r.createdAt.toISOString(),
          teamId: r.teamId,
          teamName: r.teamName,
          teamShortName: r.teamShortName ?? null,
          teamColors: r.teamColors as Record<string, unknown> | null,
          teamOrgId: r.teamOrgId,
          captainUserId: r.captainUserId,
          captainName,
          captainEmail: r.captainEmail ?? null,
          divisionId: r.divisionId,
          divisionName: r.divisionName,
          divisionMaxTeams: max,
          divisionCurrentTeamCount: current
        };
      })
    };
  }

  @Post("division-team-entries/:id/approve")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Approve an application. Transitions entry_status pending_approval → applied. Captain is notified with a link to the rollover wizard for dues + roster setup."
  })
  async approve(
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType,
    @Param("id") entryId: string
  ) {
    const ctx = await this.loadEntry(entryId);
    this.ensureLeagueInScope(scope, ctx.leagueId);
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
      recipientPersonId: ctx.captainUserId ?? null,
      recipientEmail: ctx.captainEmail ?? null,
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
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Reject a pending_approval application. Reason is required (min 10 chars). Captain is notified with the reason and can re-apply to a different division. No invoices to void at this stage — the wizard hasn't run yet."
  })
  async reject(
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType,
    @Param("id") entryId: string,
    @Body() body: RejectBodyDto
  ) {
    const ctx = await this.loadEntry(entryId);
    this.ensureLeagueInScope(scope, ctx.leagueId);
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
      recipientPersonId: ctx.captainUserId ?? null,
      recipientEmail: ctx.captainEmail ?? null,
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
        captainUserId: schema.teams.captainUserId,
        captainEmail: schema.profiles.email,
        divisionId: schema.divisions.id,
        divisionName: schema.divisions.name,
        seasonId: schema.divisions.seasonId,
        seasonName: schema.seasons.name,
        leagueId: schema.seasons.leagueId
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.divisionTeamEntries.teamId)
      )
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.teams.captainUserId)
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

  /**
   * Row-level scope gate. Super-admins and platform-scoped principals
   * have `leagueIds === null` (unrestricted). Everyone else carries a
   * whitelist projected from their role assignments — including the
   * league set under any org-scoped role. Out-of-scope resources are
   * surfaced as 404 to avoid leaking existence across orgs.
   */
  private ensureLeagueInScope(scope: UserScopeType, leagueId: string) {
    if (scope.isSuperAdmin || scope.leagueIds === null) return;
    if (!scope.leagueIds.includes(leagueId)) {
      throw new NotFoundException("Application not found");
    }
  }
}
