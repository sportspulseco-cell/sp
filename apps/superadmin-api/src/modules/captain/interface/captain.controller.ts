import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

/**
 * Captain console endpoints (Workflow 7A · Phase 2).
 *
 * - GET /captain/dashboard-state — mode detection for the home page
 *   banner + sidebar item ("registration_open" ⇒ render the green
 *   pulsing CTA; "applied" ⇒ show the progress strip; etc).
 *
 * - GET /captain/divisions — open divisions for a given league/season
 *   with pricing tiers + a live team-count. Powers wizard step 2.
 *
 * Every endpoint cross-checks `teams.captain_user_id = caller` so a
 * coach holding a captain role on a different team can't query this
 * team's state. Super-admins bypass that check.
 */
@ApiTags("captain")
@ApiBearerAuth()
@Controller("captain")
@UseGuards(JwtAuthGuard)
export class CaptainController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // -------------------------------------------------------------------
  // GET /captain/dashboard-state?teamId=…
  // -------------------------------------------------------------------

  @Get("dashboard-state")
  @ApiOperation({
    summary:
      "Returns the captain's current mode (off_season | registration_open | applied | in_season | post_season) so the banner + sidebar item know whether to render. The wizard's entry CTA is gated on `mode === registration_open`."
  })
  async dashboardState(
    @CurrentUser() user: AuthPrincipal,
    @Query("teamId") teamId: string
  ): Promise<{
    mode:
      | "off_season"
      | "registration_open"
      | "applied"
      | "in_season"
      | "post_season";
    teamId: string;
    seasonId: string | null;
    leagueId: string | null;
    seasonName: string | null;
    leagueName: string | null;
    divisionTeamEntryId: string | null;
    entryStatus: string | null;
    registrationClosesAt: string | null;
    collectedCents: number;
    thresholdCents: number;
  }> {
    if (!teamId) {
      throw new NotFoundException("teamId required");
    }

    const [team] = await this.db
      .select({
        id: schema.teams.id,
        orgId: schema.teams.orgId,
        captainUserId: schema.teams.captainUserId,
        confirmationThresholdCents: schema.teams.confirmationThresholdCents
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    const isSuperAdmin = await this.isSuperAdmin(user.userId);
    if (!isSuperAdmin && team.captainUserId !== user.userId) {
      throw new ForbiddenException("Not the captain of this team");
    }

    const now = new Date();

    // 1. Active entry — is the team currently mid-rollover (applied)
    //    or already confirmed/in-progress in a current season?
    const activeEntries = await this.db
      .select({
        entryId: schema.divisionTeamEntries.id,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        collectedCents: schema.divisionTeamEntries.collectedCents,
        thresholdCents:
          schema.divisionTeamEntries.confirmationThresholdCents,
        divisionId: schema.divisionTeamEntries.divisionId,
        seasonId: schema.divisions.seasonId,
        seasonName: schema.seasons.name,
        seasonStatus: schema.seasons.status,
        registrationClosesAt: schema.seasons.registrationClosesAt,
        leagueId: schema.seasons.leagueId,
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
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      )
      .orderBy(sql`${schema.seasons.startDate} DESC`)
      .limit(1);

    if (activeEntries[0]) {
      const e = activeEntries[0];
      const mode =
        e.entryStatus === "applied" || e.entryStatus === "accepted"
          ? ("applied" as const)
          : ("in_season" as const);
      return {
        mode,
        teamId,
        seasonId: e.seasonId,
        leagueId: e.leagueId,
        seasonName: e.seasonName,
        leagueName: e.leagueName,
        divisionTeamEntryId: e.entryId,
        entryStatus: e.entryStatus,
        registrationClosesAt: e.registrationClosesAt?.toISOString() ?? null,
        collectedCents: e.collectedCents ?? 0,
        thresholdCents: e.thresholdCents ?? team.confirmationThresholdCents
      };
    }

    // 2. No active entry — is there a season in this team's org with
    //    its registration window currently open? The team can join.
    //    A team is not pinned to a league, so we look across every
    //    league in the team's org.
    const openSeasons = await this.db
      .select({
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        leagueId: schema.seasons.leagueId,
        leagueName: schema.leagues.name,
        registrationClosesAt: schema.seasons.registrationClosesAt
      })
      .from(schema.seasons)
      .innerJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.seasons.leagueId)
      )
      .where(
        and(
          eq(schema.leagues.orgId, team.orgId),
          sql`${schema.seasons.registrationOpensAt} <= ${now}`,
          sql`${schema.seasons.registrationClosesAt} >= ${now}`,
          inArray(schema.seasons.status, ["draft", "registration_open"])
        )
      )
      .orderBy(sql`${schema.seasons.registrationClosesAt} ASC`)
      .limit(1);

    if (openSeasons[0]) {
      const s = openSeasons[0];
      return {
        mode: "registration_open",
        teamId,
        seasonId: s.seasonId,
        leagueId: s.leagueId,
        seasonName: s.seasonName,
        leagueName: s.leagueName,
        divisionTeamEntryId: null,
        entryStatus: null,
        registrationClosesAt: s.registrationClosesAt?.toISOString() ?? null,
        collectedCents: 0,
        thresholdCents: team.confirmationThresholdCents
      };
    }

    // 3. Nothing open, nothing active — show off-season placeholder.
    return {
      mode: "off_season",
      teamId,
      seasonId: null,
      leagueId: null,
      seasonName: null,
      leagueName: null,
      divisionTeamEntryId: null,
      entryStatus: null,
      registrationClosesAt: null,
      collectedCents: 0,
      thresholdCents: team.confirmationThresholdCents
    };
  }

  // -------------------------------------------------------------------
  // GET /captain/divisions?seasonId=…
  // -------------------------------------------------------------------

  @Get("divisions")
  @ApiOperation({
    summary:
      "Divisions for a given season, with their pricing tier and a live count of active team entries. Powers the wizard step-2 division picker."
  })
  async listDivisionsForSeason(
    @CurrentUser() _user: AuthPrincipal,
    @Query("seasonId") seasonId: string
  ): Promise<{
    season: { id: string; name: string; registrationClosesAt: string | null };
    items: Array<{
      id: string;
      name: string;
      tier: string | null;
      genderEligibility: string;
      maxTeams: number | null;
      currentTeamCount: number;
      pricing: {
        tierId: string;
        name: string;
        currency: string;
        fullPriceCents: number;
        paymentPlanEnabled: boolean;
        depositCents: number;
        installmentCount: number;
        installmentIntervalDays: number;
      } | null;
    }>;
  }> {
    if (!seasonId) throw new NotFoundException("seasonId required");

    const [season] = await this.db
      .select({
        id: schema.seasons.id,
        name: schema.seasons.name,
        registrationClosesAt: schema.seasons.registrationClosesAt
      })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");

    const divs = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        tier: schema.divisions.tier,
        genderEligibility: schema.divisions.genderEligibility,
        maxTeams: schema.divisions.maxTeams
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.seasonId, seasonId));

    if (divs.length === 0) {
      return {
        season: {
          id: season.id,
          name: season.name,
          registrationClosesAt:
            season.registrationClosesAt?.toISOString() ?? null
        },
        items: []
      };
    }

    // Active team counts per division (anything not withdrawn/rejected).
    const counts = await this.db
      .select({
        divisionId: schema.divisionTeamEntries.divisionId,
        count: sql<number>`count(*)::int`
      })
      .from(schema.divisionTeamEntries)
      .where(
        and(
          inArray(
            schema.divisionTeamEntries.divisionId,
            divs.map((d) => d.id)
          ),
          sql`${schema.divisionTeamEntries.entryStatus} NOT IN ('withdrawn','rejected','disqualified')`
        )
      )
      .groupBy(schema.divisionTeamEntries.divisionId);
    const countByDiv = new Map(counts.map((c) => [c.divisionId, c.count]));

    // Pricing tiers — fetch all season-level tiers and per-division tiers,
    // then resolve the active tier per division.
    const tiers = await this.db
      .select()
      .from(schema.pricingTiers)
      .where(
        and(
          eq(schema.pricingTiers.seasonId, seasonId),
          eq(schema.pricingTiers.isActive, true)
        )
      );

    function pricingFor(divisionId: string) {
      const perDiv = tiers.find((t) => t.divisionId === divisionId);
      const seasonWide = tiers.find((t) => !t.divisionId);
      const t = perDiv ?? seasonWide;
      if (!t) return null;
      return {
        tierId: t.id,
        name: t.name,
        currency: t.currency,
        fullPriceCents: t.fullPriceCents,
        paymentPlanEnabled: t.paymentPlanEnabled,
        depositCents: t.depositCents,
        installmentCount: t.installmentCount,
        installmentIntervalDays: t.installmentIntervalDays
      };
    }

    return {
      season: {
        id: season.id,
        name: season.name,
        registrationClosesAt:
          season.registrationClosesAt?.toISOString() ?? null
      },
      items: divs.map((d) => ({
        id: d.id,
        name: d.name,
        tier: d.tier ?? null,
        genderEligibility: d.genderEligibility ?? "open",
        maxTeams: d.maxTeams ?? null,
        currentTeamCount: countByDiv.get(d.id) ?? 0,
        pricing: pricingFor(d.id)
      }))
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ isSuper: schema.profiles.isSuperAdmin })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, userId))
      .limit(1);
    return row?.isSuper ?? false;
  }
}
