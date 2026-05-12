import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { NotificationService } from "../../communications/application/notification.service";

class ApplyBodyDto {
  @IsUUID() teamId!: string;
  @IsUUID() seasonId!: string;
  @IsUUID() divisionId!: string;
}

class WithdrawBodyDto {
  @IsUUID() divisionTeamEntryId!: string;
}

/**
 * Captain-facing approval-gate endpoints. The team applies for a
 * division → DTE row in `pending_approval` → admin approves → DTE
 * transitions to `applied` → captain proceeds to the rollover wizard
 * (Workflow 7A) for dues split + roster invites.
 */
@ApiTags("captain/register/apply")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class CaptainApplicationsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  // -------------------------------------------------------------------
  // GET /captain/open-seasons?teamId=…
  // Open seasons in the team's org that the team hasn't already applied to.
  // -------------------------------------------------------------------
  @Get("captain/open-seasons")
  @ApiOperation({
    summary:
      "Open seasons in the team's org that the team hasn't already applied to (non-rejected DTE)."
  })
  async openSeasons(
    @CurrentUser() user: AuthPrincipal,
    @Query("teamId") teamId: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);

    const now = new Date();

    // All seasons within this org currently in the registration window.
    const seasons = await this.db
      .select({
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        leagueId: schema.seasons.leagueId,
        leagueName: schema.leagues.name,
        registrationOpensAt: schema.seasons.registrationOpensAt,
        registrationClosesAt: schema.seasons.registrationClosesAt,
        status: schema.seasons.status,
        startDate: schema.seasons.startDate,
        endDate: schema.seasons.endDate
      })
      .from(schema.seasons)
      .innerJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.seasons.leagueId)
      )
      .where(
        and(
          eq(schema.leagues.orgId, team.orgId),
          eq(schema.seasons.status, "registration_open"),
          lte(schema.seasons.registrationOpensAt, now),
          gte(schema.seasons.registrationClosesAt, now)
        )
      )
      .orderBy(desc(schema.seasons.startDate));

    if (seasons.length === 0) return { items: [] };

    // Exclude seasons the team already has a non-rejected DTE on.
    const teamEntries = await this.db
      .select({
        seasonId: schema.divisions.seasonId,
        entryStatus: schema.divisionTeamEntries.entryStatus
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "pending_approval",
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      );
    const blockedSeasons = new Set(teamEntries.map((r) => r.seasonId));

    // Count active divisions + active team entries per season.
    const seasonIds = seasons.map((s) => s.seasonId);
    const divisionCounts = await this.db
      .select({
        seasonId: schema.divisions.seasonId,
        count: sql<number>`COUNT(*)::int`
      })
      .from(schema.divisions)
      .where(
        and(
          inArray(schema.divisions.seasonId, seasonIds),
          eq(schema.divisions.status, "active")
        )
      )
      .groupBy(schema.divisions.seasonId);
    const byDivCount = new Map(divisionCounts.map((r) => [r.seasonId, r.count]));

    // Total teams registered (any non-withdrawn/rejected) per season.
    // Powers the "12 teams registered" stat on season cards (mock 1).
    const teamCounts = await this.db
      .select({
        seasonId: schema.divisions.seasonId,
        count: sql<number>`COUNT(*)::int`
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(
        and(
          inArray(schema.divisions.seasonId, seasonIds),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "pending_approval",
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      )
      .groupBy(schema.divisions.seasonId);
    const byTeamCount = new Map(teamCounts.map((r) => [r.seasonId, r.count]));

    return {
      items: seasons
        .filter((s) => !blockedSeasons.has(s.seasonId))
        .map((s) => ({
          seasonId: s.seasonId,
          seasonName: s.seasonName,
          leagueId: s.leagueId,
          leagueName: s.leagueName,
          registrationOpensAt: s.registrationOpensAt?.toISOString() ?? null,
          registrationClosesAt: s.registrationClosesAt?.toISOString() ?? null,
          startDate: s.startDate ?? null,
          endDate: s.endDate ?? null,
          availableDivisions: byDivCount.get(s.seasonId) ?? 0,
          teamsRegistered: byTeamCount.get(s.seasonId) ?? 0
        }))
    };
  }

  // -------------------------------------------------------------------
  // GET /captain/applications?teamId=…
  // Every application this team has filed (pending + approved + rejected + withdrawn).
  // -------------------------------------------------------------------
  @Get("captain/applications")
  @ApiOperation({
    summary: "All applications this team has filed across seasons."
  })
  async myApplications(
    @CurrentUser() user: AuthPrincipal,
    @Query("teamId") teamId: string
  ) {
    await this.requireCaptainTeam(user.userId, teamId);
    const rows = await this.db
      .select({
        id: schema.divisionTeamEntries.id,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        createdAt: schema.divisionTeamEntries.createdAt,
        metadata: schema.divisionTeamEntries.metadata,
        thresholdCents: schema.divisionTeamEntries.confirmationThresholdCents,
        collectedCents: schema.divisionTeamEntries.collectedCents,
        divisionId: schema.divisions.id,
        divisionName: schema.divisions.name,
        divisionMaxTeams: schema.divisions.maxTeams,
        seasonId: schema.divisions.seasonId,
        seasonName: schema.seasons.name,
        seasonStartDate: schema.seasons.startDate,
        seasonEndDate: schema.seasons.endDate,
        registrationClosesAt: schema.seasons.registrationClosesAt,
        leagueName: schema.leagues.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .innerJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.seasons.leagueId)
      )
      .where(eq(schema.divisionTeamEntries.teamId, teamId))
      .orderBy(desc(schema.divisionTeamEntries.createdAt))
      .limit(50);

    if (rows.length === 0) return { items: [] };

    // Resolve fee per division (active tier — per-division override, else season-wide).
    const seasonIds = Array.from(new Set(rows.map((r) => r.seasonId)));
    const tiers = await this.db
      .select()
      .from(schema.pricingTiers)
      .where(
        and(
          inArray(schema.pricingTiers.seasonId, seasonIds),
          eq(schema.pricingTiers.isActive, true)
        )
      );
    function feeFor(seasonId: string, divisionId: string) {
      const perDiv = tiers.find(
        (t) => t.seasonId === seasonId && t.divisionId === divisionId
      );
      const seasonWide = tiers.find(
        (t) => t.seasonId === seasonId && !t.divisionId
      );
      const t = perDiv ?? seasonWide;
      if (!t) return null;
      return { fullPriceCents: t.fullPriceCents, currency: t.currency };
    }

    return {
      items: rows.map((r) => {
        const fee = feeFor(r.seasonId, r.divisionId);
        return {
          id: r.id,
          entryStatus: r.entryStatus,
          createdAt: r.createdAt.toISOString(),
          metadata: r.metadata as Record<string, unknown>,
          thresholdCents: r.thresholdCents ?? 0,
          collectedCents: r.collectedCents ?? 0,
          divisionId: r.divisionId,
          divisionName: r.divisionName,
          divisionMaxTeams: r.divisionMaxTeams ?? null,
          seasonId: r.seasonId,
          seasonName: r.seasonName,
          seasonStartDate: r.seasonStartDate ?? null,
          seasonEndDate: r.seasonEndDate ?? null,
          registrationClosesAt: r.registrationClosesAt?.toISOString() ?? null,
          leagueName: r.leagueName,
          feeCents: fee?.fullPriceCents ?? null,
          currency: fee?.currency ?? null
        };
      })
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/register/apply
  // Body: { teamId, seasonId, divisionId }
  // -------------------------------------------------------------------
  @Post("captain/register/apply")
  @ApiOperation({
    summary:
      "Captain applies to register the team in one division. Creates a division_team_entries row with entry_status='pending_approval' and notifies platform / org / league admins for review."
  })
  async apply(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: ApplyBodyDto
  ) {
    const team = await this.requireCaptainTeam(user.userId, body.teamId);

    const now = new Date();

    // Season open?
    const [season] = await this.db
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, body.seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");
    if (
      season.status !== "registration_open" ||
      !season.registrationClosesAt ||
      season.registrationClosesAt < now
    ) {
      throw new ConflictException({
        error: "season_closed",
        message: "Registration is not open for this season."
      });
    }

    // Division belongs to this season + not full?
    const [division] = await this.db
      .select()
      .from(schema.divisions)
      .where(eq(schema.divisions.id, body.divisionId))
      .limit(1);
    if (!division) throw new NotFoundException("Division not found");
    if (division.seasonId !== body.seasonId) {
      throw new ConflictException({
        error: "division_mismatch",
        message: "Division doesn't belong to this season."
      });
    }
    if (division.maxTeams) {
      const [c] = await this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.divisionTeamEntries)
        .where(
          and(
            eq(schema.divisionTeamEntries.divisionId, body.divisionId),
            inArray(schema.divisionTeamEntries.entryStatus, [
              "pending_approval",
              "applied",
              "accepted",
              "confirmed"
            ])
          )
        );
      if ((c?.count ?? 0) >= division.maxTeams) {
        throw new ConflictException({
          error: "division_full",
          message: "This division is full."
        });
      }
    }

    // Already applied to this season?
    const existing = await this.db
      .select({ id: schema.divisionTeamEntries.id })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, body.teamId),
          eq(schema.divisions.seasonId, body.seasonId),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "pending_approval",
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      )
      .limit(1);
    if (existing[0]) {
      throw new ConflictException({
        error: "already_applied",
        message:
          "Your team already has an active application for this season."
      });
    }

    const rows = await this.db
      .insert(schema.divisionTeamEntries)
      .values({
        teamId: body.teamId,
        divisionId: body.divisionId,
        entryStatus: "pending_approval",
        confirmationThresholdCents: team.confirmationThresholdCents ?? 0,
        collectedCents: 0
      })
      .returning();
    const entry = rows[0]!;

    // Fire-and-forget notifications.
    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "TEAM_REGISTRATION_APPLIED_CONFIRMATION",
      idempotencyKey: `app-confirm-${entry.id}`,
      payload: {
        teamName: team.name,
        divisionName: division.name,
        seasonName: season.name
      }
    });
    // Fan out one notification per admin role so the dispatcher can
    // route to platform / org / league admin recipients distinctly
    // (per spec: "send to super_admin + org_admin + league_admin").
    for (const role of ["super_admin", "org_admin", "league_admin"] as const) {
      void this.notify.queue({
        orgId: team.orgId,
        templateCode: "TEAM_REGISTRATION_APPLIED",
        idempotencyKey: `app-admin-${role}-${entry.id}`,
        payload: {
          teamName: team.name,
          divisionName: division.name,
          seasonName: season.name,
          entryId: entry.id,
          targetRole: role,
          leagueId: season.leagueId
        }
      });
    }

    return { entry };
  }

  // -------------------------------------------------------------------
  // POST /captain/register/withdraw
  // -------------------------------------------------------------------
  @Post("captain/register/withdraw")
  @ApiOperation({
    summary:
      "Captain withdraws an open application (entry_status='pending_approval' only). After approval, withdrawal goes through a different flow (team disbandment)."
  })
  async withdraw(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: WithdrawBodyDto
  ) {
    const [entry] = await this.db
      .select({
        id: schema.divisionTeamEntries.id,
        teamId: schema.divisionTeamEntries.teamId,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        divisionId: schema.divisionTeamEntries.divisionId,
        divisionName: schema.divisions.name,
        seasonId: schema.divisions.seasonId,
        seasonName: schema.seasons.name,
        leagueId: schema.seasons.leagueId
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .where(eq(schema.divisionTeamEntries.id, body.divisionTeamEntryId))
      .limit(1);
    if (!entry) throw new NotFoundException("Application not found");

    const team = await this.requireCaptainTeam(user.userId, entry.teamId);

    if (entry.entryStatus !== "pending_approval") {
      throw new ConflictException({
        error: "not_withdrawable",
        message: `Cannot withdraw an application in status=${entry.entryStatus}.`
      });
    }

    await this.db
      .update(schema.divisionTeamEntries)
      .set({ entryStatus: "withdrawn" })
      .where(eq(schema.divisionTeamEntries.id, entry.id));

    // Mirror the apply() fan-out so each admin tier (super / org / league)
    // gets its own notification row with metadata.targetRole + leagueId,
    // letting the dispatcher route to the right recipients distinctly.
    for (const role of ["super_admin", "org_admin", "league_admin"] as const) {
      void this.notify.queue({
        orgId: team.orgId,
        templateCode: "TEAM_REGISTRATION_WITHDRAWN",
        idempotencyKey: `app-withdrawn-${role}-${entry.id}`,
        payload: {
          teamName: team.name,
          divisionName: entry.divisionName,
          seasonName: entry.seasonName,
          entryId: entry.id,
          targetRole: role,
          leagueId: entry.leagueId
        }
      });
    }

    return { entryId: entry.id, status: "withdrawn" as const };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------
  private async requireCaptainTeam(userId: string, teamId: string) {
    const [team] = await this.db
      .select({
        id: schema.teams.id,
        orgId: schema.teams.orgId,
        name: schema.teams.name,
        captainUserId: schema.teams.captainUserId,
        confirmationThresholdCents: schema.teams.confirmationThresholdCents
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    if (team.captainUserId !== userId) {
      const [profile] = await this.db
        .select({ isSuper: schema.profiles.isSuperAdmin })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, userId))
        .limit(1);
      if (!profile?.isSuper)
        throw new ForbiddenException("Not the captain of this team");
    }
    return team;
  }
}
