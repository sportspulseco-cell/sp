import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { NotificationService } from "../../communications/application/notification.service";

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
class PlayerSplitDto {
  /** Optional persons.id for known players. */
  @IsOptional() @IsUUID() personId?: string;
  /** Email — required when personId is absent. */
  @IsOptional() @IsEmail() email?: string;
  @IsInt() @Min(0) amountCents!: number;
}

export class CaptainRegisterBodyDto {
  @IsUUID() teamId!: string;
  @IsUUID() divisionId!: string;
  @IsString() splitMode!: "even" | "custom";
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerSplitDto)
  playerSplits!: PlayerSplitDto[];
}

@ApiTags("captain")
@ApiBearerAuth()
@Controller("captain")
@UseGuards(JwtAuthGuard)
export class CaptainController {
  private readonly log = new Logger(CaptainController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

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

    try {
      return await this.dashboardStateInner(user, teamId);
    } catch (e) {
      if (
        e instanceof NotFoundException ||
        e instanceof ForbiddenException ||
        e instanceof BadRequestException
      ) {
        throw e;
      }
      // Keep the logger.error so an unexpected throw surfaces in the
      // dashboard runtime logs even though our hobby plan's API
      // doesn't currently expose them programmatically.
      this.log.error(
        `dashboard-state failed for user=${user.userId} team=${teamId}: ${(e as Error).message}`,
        (e as Error).stack
      );
      throw e;
    }
  }

  private async dashboardStateInner(
    user: AuthPrincipal,
    teamId: string
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

    const isCaptain = await userIsCaptainOfTeam(
      this.db,
      user.userId,
      teamId,
      team.captainUserId
    );
    if (!isCaptain) {
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
      .orderBy(desc(schema.seasons.startDate))
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
          // Raw `sql\`${col} <= ${now}\`` was binding a JS Date directly
          // and pg threw `"string" argument must be of type string …
          // Received an instance of Date` (BUG-023). Drizzle's typed
          // comparators serialize Date values correctly.
          lte(schema.seasons.registrationOpensAt, now),
          gte(schema.seasons.registrationClosesAt, now),
          inArray(schema.seasons.status, ["draft", "registration_open"])
        )
      )
      .orderBy(asc(schema.seasons.registrationClosesAt))
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
    season: {
      id: string;
      name: string;
      registrationClosesAt: string | null;
      startDate: string | null;
      endDate: string | null;
      teamsRegistered: number;
      maxRosterSize: number | null;
    };
    items: Array<{
      id: string;
      name: string;
      tier: string | null;
      genderEligibility: string;
      maxTeams: number | null;
      currentTeamCount: number;
      ageGroupLabel: string | null;
      gamesCount: number | null;
      perPlayerCostCents: number | null;
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
        registrationClosesAt: schema.seasons.registrationClosesAt,
        startDate: schema.seasons.startDate,
        endDate: schema.seasons.endDate,
        config: schema.seasons.config
      })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");

    const cfg = (season.config as { maxRosterSize?: number }) ?? {};
    // Hockey defaults to ~14 if admin hasn't set it; per-player cost
    // is purely an *advertised* number, so a sane default beats null.
    const maxRosterSize = cfg.maxRosterSize ?? 14;

    const divs = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        tier: schema.divisions.tier,
        genderEligibility: schema.divisions.genderEligibility,
        maxTeams: schema.divisions.maxTeams,
        ageGroupId: schema.divisions.ageGroupId,
        ruleSetOverrides: schema.divisions.ruleSetOverrides
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.seasonId, seasonId));

    if (divs.length === 0) {
      return {
        season: {
          id: season.id,
          name: season.name,
          registrationClosesAt:
            season.registrationClosesAt?.toISOString() ?? null,
          startDate: season.startDate ?? null,
          endDate: season.endDate ?? null,
          teamsRegistered: 0,
          maxRosterSize
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
    const teamsRegistered = Array.from(countByDiv.values()).reduce(
      (a, b) => a + b,
      0
    );

    // Age-group labels (one round-trip, only if any division references one).
    const ageGroupIds = Array.from(
      new Set(divs.map((d) => d.ageGroupId).filter((x): x is string => !!x))
    );
    const ageGroupRows = ageGroupIds.length
      ? await this.db
          .select({ id: schema.ageGroups.id, label: schema.ageGroups.label })
          .from(schema.ageGroups)
          .where(inArray(schema.ageGroups.id, ageGroupIds))
      : [];
    const ageGroupLabel = new Map(ageGroupRows.map((a) => [a.id, a.label]));

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
          season.registrationClosesAt?.toISOString() ?? null,
        startDate: season.startDate ?? null,
        endDate: season.endDate ?? null,
        teamsRegistered,
        maxRosterSize
      },
      items: divs.map((d) => {
        const pricing = pricingFor(d.id);
        const rules =
          (d.ruleSetOverrides as { gamesPerSeason?: number; totalGames?: number }) ??
          {};
        const gamesCount = rules.gamesPerSeason ?? rules.totalGames ?? null;
        const perPlayerCostCents =
          pricing && maxRosterSize
            ? Math.round(pricing.fullPriceCents / maxRosterSize)
            : null;
        return {
          id: d.id,
          name: d.name,
          tier: d.tier ?? null,
          genderEligibility: d.genderEligibility ?? "open",
          maxTeams: d.maxTeams ?? null,
          currentTeamCount: countByDiv.get(d.id) ?? 0,
          ageGroupLabel: d.ageGroupId ? ageGroupLabel.get(d.ageGroupId) ?? null : null,
          gamesCount,
          perPlayerCostCents,
          pricing
        };
      })
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/register — atomic 8-write rollover submit
  // -------------------------------------------------------------------

  @Post("register")
  @ApiOperation({
    summary:
      "Workflow 7A § 4.4 — Atomic 8-write submit. Creates the division_team_entries row, the master invoice (team_dues), per-player sub-invoices, installment_schedules for each, team_invites (personal kind), the roster snapshot, and emits audit. If any step throws, the transaction rolls back — zero rows in any table. Returns the created entry id so the wizard can switch to the status-polling view."
  })
  async register(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CaptainRegisterBodyDto
  ): Promise<{
    divisionTeamEntryId: string;
    entryStatus: string;
    masterInvoiceId: string;
    subInvoiceCount: number;
    inviteCount: number;
  }> {
    try {
      return await this.registerInner(user, body);
    } catch (e) {
      if (
        e instanceof NotFoundException ||
        e instanceof ForbiddenException ||
        e instanceof BadRequestException
      ) {
        throw e;
      }
      this.log.error(
        `captain/register failed: ${(e as Error).message}`,
        (e as Error).stack
      );
      // DIAG (BUG-026): surface inline because Vercel hobby plan has no
      // runtime log API. Strip when bug is closed.
      throw new BadRequestException({
        diag: "captain-register-throw",
        message: (e as Error).message,
        name: (e as Error).name,
        stack: ((e as Error).stack ?? "").slice(0, 2000)
      });
    }
  }

  private async registerInner(
    user: AuthPrincipal,
    body: CaptainRegisterBodyDto
  ): Promise<{
    divisionTeamEntryId: string;
    entryStatus: string;
    masterInvoiceId: string;
    subInvoiceCount: number;
    inviteCount: number;
  }> {
    // ----- 0. Authorise + load context -----
    const [team] = await this.db
      .select({
        id: schema.teams.id,
        orgId: schema.teams.orgId,
        captainUserId: schema.teams.captainUserId,
        confirmationThresholdCents: schema.teams.confirmationThresholdCents,
        sportCode: schema.teams.sportCode
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, body.teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    const isCaptain = await userIsCaptainOfTeam(
      this.db,
      user.userId,
      body.teamId,
      team.captainUserId
    );
    if (!isCaptain) {
      throw new ForbiddenException("Not the captain of this team");
    }

    const [division] = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        seasonId: schema.divisions.seasonId,
        maxTeams: schema.divisions.maxTeams
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, body.divisionId))
      .limit(1);
    if (!division) throw new NotFoundException("Division not found");

    const [season] = await this.db
      .select({
        id: schema.seasons.id,
        leagueId: schema.seasons.leagueId,
        name: schema.seasons.name,
        registrationClosesAt: schema.seasons.registrationClosesAt
      })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, division.seasonId))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");

    // Resolve the active pricing tier for this division — same lookup
    // as GET /captain/divisions.
    const tiers = await this.db
      .select()
      .from(schema.pricingTiers)
      .where(
        and(
          eq(schema.pricingTiers.seasonId, season.id),
          eq(schema.pricingTiers.isActive, true)
        )
      );
    const pricing =
      tiers.find((t) => t.divisionId === division.id) ??
      tiers.find((t) => !t.divisionId) ??
      null;
    if (!pricing) {
      throw new BadRequestException(
        "Division has no active pricing tier — league admin must configure one before registration."
      );
    }

    // ----- 1. Validate split sums + capacity -----
    if (body.playerSplits.length === 0) {
      throw new BadRequestException("Roster must include at least one player.");
    }
    const splitTotal = body.playerSplits.reduce(
      (acc, p) => acc + p.amountCents,
      0
    );
    if (splitTotal !== pricing.fullPriceCents) {
      throw new BadRequestException(
        `Dues split must equal the team fee exactly (got ${splitTotal}, expected ${pricing.fullPriceCents}).`
      );
    }
    for (const p of body.playerSplits) {
      if (!p.personId && !p.email) {
        throw new BadRequestException(
          "Every player split needs either a personId or an email."
        );
      }
      if (p.amountCents < 0) {
        throw new BadRequestException("Split amounts must be non-negative.");
      }
    }

    // ----- 2. Atomic transaction · 8 writes -----
    const now = new Date();
    const threshold = team.confirmationThresholdCents;
    const initialStatus = threshold === 0 ? "confirmed" : "applied";
    const personalInviteExpiry = new Date(
      Math.min(
        now.getTime() + 14 * 24 * 60 * 60 * 1000,
        season.registrationClosesAt?.getTime() ?? Infinity
      )
    );

    const result = await this.db.transaction(async (tx) => {
      // STEP 1 — division_team_entries row.
      const [dte] = await tx
        .insert(schema.divisionTeamEntries)
        .values({
          teamId: team.id,
          divisionId: division.id,
          entryStatus: initialStatus,
          confirmationThresholdCents: threshold,
          collectedCents: 0,
          metadata: { splitMode: body.splitMode }
        })
        .returning();
      if (!dte) throw new Error("DTE insert returned no row");

      // STEP 2 — master invoice (team_dues).
      const masterNumber = `INV-${dte.id.slice(0, 8).toUpperCase()}-MASTER`;
      const [master] = await tx
        .insert(schema.invoices)
        .values({
          orgId: team.orgId,
          invoiceNumber: masterNumber,
          invoiceType: "team_dues",
          currency: pricing.currency,
          subtotalCents: pricing.fullPriceCents,
          totalCents: pricing.fullPriceCents,
          status: "draft",
          issuedAt: now,
          dueAt: season.registrationClosesAt ?? null,
          metadata: {
            divisionTeamEntryId: dte.id,
            divisionId: division.id,
            seasonId: season.id,
            pricingTierId: pricing.id
          }
        })
        .returning();
      if (!master) throw new Error("master invoice insert returned no row");

      await tx
        .update(schema.divisionTeamEntries)
        .set({ invoiceId: master.id })
        .where(eq(schema.divisionTeamEntries.id, dte.id));

      // STEP 3 — sub-invoices, one per player split.
      const subInvoices: Array<{
        id: string;
        amountCents: number;
        recipientEmail: string | null;
        recipientPersonId: string | null;
      }> = [];
      for (const [i, split] of body.playerSplits.entries()) {
        const subNumber = `${masterNumber}-${String(i + 1).padStart(2, "0")}`;
        const [sub] = await tx
          .insert(schema.invoices)
          .values({
            orgId: team.orgId,
            invoiceNumber: subNumber,
            invoiceType: "sub_invoice",
            parentInvoiceId: master.id,
            recipientPersonId: split.personId ?? null,
            recipientEmail: split.email ?? null,
            currency: pricing.currency,
            subtotalCents: split.amountCents,
            totalCents: split.amountCents,
            status: "sent",
            issuedAt: now,
            dueAt: season.registrationClosesAt ?? null,
            metadata: {
              divisionTeamEntryId: dte.id,
              splitMode: body.splitMode
            }
          })
          .returning();
        if (!sub) throw new Error("sub-invoice insert returned no row");
        subInvoices.push({
          id: sub.id,
          amountCents: split.amountCents,
          recipientEmail: split.email ?? null,
          recipientPersonId: split.personId ?? null
        });
      }

      // STEP 4 — installment_schedules per sub-invoice.
      const hasPlan =
        pricing.paymentPlanEnabled && pricing.installmentCount > 0;
      for (const sub of subInvoices) {
        // Player's share of the deposit, proportional to their split.
        const playerDeposit = hasPlan
          ? Math.round(
              (pricing.depositCents * sub.amountCents) / pricing.fullPriceCents
            )
          : sub.amountCents;
        const remaining = sub.amountCents - playerDeposit;
        const perInstallment = hasPlan && pricing.installmentCount > 0
          ? Math.round(remaining / pricing.installmentCount)
          : 0;

        // installmentNumber = 0 → deposit (due today)
        await tx.insert(schema.installmentSchedules).values({
          invoiceId: sub.id,
          installmentNumber: 0,
          dueDate: now,
          amountCents: playerDeposit,
          status: "scheduled"
        });

        if (hasPlan) {
          for (let n = 1; n <= pricing.installmentCount; n++) {
            const dueDays = pricing.installmentIntervalDays * n;
            const dueDate = new Date(now.getTime() + dueDays * 86400000);
            // Last installment absorbs rounding remainder.
            const amount =
              n === pricing.installmentCount
                ? remaining - perInstallment * (pricing.installmentCount - 1)
                : perInstallment;
            await tx.insert(schema.installmentSchedules).values({
              invoiceId: sub.id,
              installmentNumber: n,
              dueDate,
              amountCents: amount,
              status: "scheduled"
            });
          }
        }
      }

      // STEP 5 — team_invites (personal kind, 14-day expiry).
      const invites: Array<{ id: string; email: string; token: string }> = [];
      for (const split of body.playerSplits) {
        // Skip invite creation when the player is already a known
        // persons row with an email we can't infer (no-email split).
        const recipient = split.email ?? null;
        if (!recipient) continue;
        const token = randomBytes(32).toString("base64url");
        const [inv] = await tx
          .insert(schema.teamInvites)
          .values({
            teamId: team.id,
            seasonId: season.id,
            issuedByUserId: user.userId,
            inviteeEmail: recipient,
            token,
            kind: "personal",
            expiresAt: personalInviteExpiry,
            status: "pending",
            lastSentAt: now,
            sendCount: 1
          })
          .returning();
        if (inv) invites.push({ id: inv.id, email: recipient, token });
      }

      // STEP 7 — roster snapshot on the DTE (audit only, not the live roster).
      await tx
        .update(schema.divisionTeamEntries)
        .set({
          rosterSnapshot: {
            invitedPersonIds: body.playerSplits
              .map((p) => p.personId)
              .filter(Boolean) as string[],
            invitedEmails: body.playerSplits
              .map((p) => p.email)
              .filter(Boolean) as string[],
            invitedAt: now.toISOString()
          }
        })
        .where(eq(schema.divisionTeamEntries.id, dte.id));

      return {
        dteId: dte.id,
        entryStatus: dte.entryStatus,
        masterId: master.id,
        subInvoices,
        invites
      };
    });

    // ----- STEP 6 — batch notifications (fire-and-forget, post-tx) -----
    for (const inv of result.invites) {
      this.notify.queue({
        orgId: team.orgId,
        templateCode: "TEAM_INVITE_NEW",
        idempotencyKey: `invite-${inv.id}`,
        recipientEmail: inv.email,
        payload: {
          teamId: team.id,
          divisionName: division.name,
          seasonName: season.name,
          inviteToken: inv.token
        }
      });
    }
    for (const sub of result.subInvoices) {
      if (!sub.recipientEmail) continue;
      this.notify.queue({
        orgId: team.orgId,
        templateCode: "SUB_INVOICE_SENT",
        idempotencyKey: `sub-invoice-${sub.id}`,
        recipientEmail: sub.recipientEmail,
        payload: {
          invoiceId: sub.id,
          amountCents: sub.amountCents,
          seasonName: season.name
        }
      });
    }

    // STEP 8 — audit event is handled automatically by the global
    // AuditInterceptor on any 2xx POST (action label
    // "division_team_entries.created" inferred from the route).

    return {
      divisionTeamEntryId: result.dteId,
      entryStatus: result.entryStatus,
      masterInvoiceId: result.masterId,
      subInvoiceCount: result.subInvoices.length,
      inviteCount: result.invites.length
    };
  }

  // -------------------------------------------------------------------
  // GET /captain/register/status — confirmation progress polling
  // -------------------------------------------------------------------

  @Get("register/status")
  @ApiOperation({
    summary:
      "Polling endpoint for the post-submit confirmation progress bar. Poll every 30 s while entryStatus is `applied`."
  })
  async registerStatus(
    @CurrentUser() user: AuthPrincipal,
    @Query("dteId") dteId: string
  ): Promise<{
    entryStatus: string;
    collectedCents: number;
    thresholdCents: number;
    pct: number;
  }> {
    if (!dteId) throw new NotFoundException("dteId required");
    const [row] = await this.db
      .select({
        entryStatus: schema.divisionTeamEntries.entryStatus,
        collectedCents: schema.divisionTeamEntries.collectedCents,
        thresholdCents:
          schema.divisionTeamEntries.confirmationThresholdCents,
        teamId: schema.teams.id,
        teamCaptain: schema.teams.captainUserId
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.divisionTeamEntries.teamId)
      )
      .where(eq(schema.divisionTeamEntries.id, dteId))
      .limit(1);
    if (!row) throw new NotFoundException("Entry not found");

    const isCaptain = await userIsCaptainOfTeam(
      this.db,
      user.userId,
      row.teamId,
      row.teamCaptain
    );
    if (!isCaptain) {
      throw new ForbiddenException("Not the captain of this entry's team");
    }

    const pct =
      row.thresholdCents === 0
        ? 100
        : Math.min(
            100,
            Math.round((row.collectedCents / row.thresholdCents) * 100)
          );
    return {
      entryStatus: row.entryStatus,
      collectedCents: row.collectedCents,
      thresholdCents: row.thresholdCents,
      pct
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/register/:dteId/recompute-threshold
  //
  // Idempotent watcher logic. Designed to be called by the eventual
  // `payment.succeeded` webhook (and exposed manually for admin /
  // manual reconciliation). Sums all succeeded deposit installments
  // (installmentNumber=0) under this entry's master invoice; if the
  // running total crosses the threshold, transitions applied →
  // confirmed and queues the TEAM_CONFIRMED notifications.
  // -------------------------------------------------------------------

  @Post("register/:dteId/recompute-threshold")
  @ApiOperation({
    summary:
      "Workflow 7A § 4.5 — recompute the collected-cents bucket for one DTE and transition to `confirmed` if the threshold is met. Idempotent (running twice produces no duplicate notifications). Real wiring is the payment.succeeded webhook; this endpoint exists for manual reconciliation + future webhook stub."
  })
  async recomputeThreshold(
    @Param("dteId") dteId: string
  ): Promise<{
    entryStatus: string;
    collectedCents: number;
    thresholdCents: number;
    transitioned: boolean;
  }> {
    const [entry] = await this.db
      .select({
        id: schema.divisionTeamEntries.id,
        teamId: schema.divisionTeamEntries.teamId,
        invoiceId: schema.divisionTeamEntries.invoiceId,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        thresholdCents:
          schema.divisionTeamEntries.confirmationThresholdCents
      })
      .from(schema.divisionTeamEntries)
      .where(eq(schema.divisionTeamEntries.id, dteId))
      .limit(1);
    if (!entry) throw new NotFoundException("Entry not found");
    if (!entry.invoiceId) {
      throw new BadRequestException("Entry has no master invoice");
    }

    // Sum succeeded deposit installments (installmentNumber=0) across
    // every sub-invoice of this entry's master.
    const subInvoices = await this.db
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(eq(schema.invoices.parentInvoiceId, entry.invoiceId));
    let collected = 0;
    if (subInvoices.length > 0) {
      const rows = await this.db
        .select({
          total: sql<number>`COALESCE(SUM(${schema.installmentSchedules.amountCents}), 0)::int`
        })
        .from(schema.installmentSchedules)
        .where(
          and(
            inArray(
              schema.installmentSchedules.invoiceId,
              subInvoices.map((s) => s.id)
            ),
            eq(schema.installmentSchedules.installmentNumber, 0),
            eq(schema.installmentSchedules.status, "succeeded")
          )
        );
      collected = rows[0]?.total ?? 0;
    }

    const transitioned =
      entry.entryStatus === "applied" && collected >= entry.thresholdCents;

    await this.db
      .update(schema.divisionTeamEntries)
      .set({
        collectedCents: collected,
        entryStatus: transitioned ? "confirmed" : entry.entryStatus
      })
      .where(eq(schema.divisionTeamEntries.id, entry.id));

    if (transitioned) {
      const [team] = await this.db
        .select({
          orgId: schema.teams.orgId
        })
        .from(schema.teams)
        .where(eq(schema.teams.id, entry.teamId))
        .limit(1);
      if (team) {
        this.notify.queue({
          orgId: team.orgId,
          templateCode: "TEAM_CONFIRMED",
          idempotencyKey: `team-confirmed-${entry.id}`,
          payload: { entryId: entry.id }
        });
      }
    }

    return {
      entryStatus: transitioned ? "confirmed" : entry.entryStatus,
      collectedCents: collected,
      thresholdCents: entry.thresholdCents,
      transitioned
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
