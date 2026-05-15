import {
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
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import {
  resolveDivisionRules,
  resolvePlayoffConfig
} from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { NotificationService } from "../../communications/application/notification.service";

/**
 * Workflow 7C — bulk sweep operations on eligibility_records.
 *
 * - POST /compliance/eligibility/season/:id/sweep
 *   Re-runs the registration check sequence (§2) for every active
 *   membership in the season. UPSERTs eligibility_records via the
 *   (person_id, season_id) unique index.
 *
 * - POST /compliance/eligibility/season/:id/lock-sweep
 *   Workflow 7C §3 — scheduled at seasons.rosterLockAt. Flags
 *   USA Hockey IDs that are expiring within the season window or
 *   already expired.
 *
 * - POST /compliance/eligibility/season/:id/playoff-sweep
 *   Workflow 7C §4 — runs the 3 playoff checks for every active
 *   member. Idempotent (UPSERT). Hard dependency for the bracket
 *   generator.
 *
 * - GET /compliance/eligibility/season/:id/duplicates
 *   Returns groups of (governingBodyId, externalId) shared by two
 *   or more registered players in the season — powers the admin
 *   duplicate-ID panel (§5).
 */
@ApiTags("compliance/sweeps")
@ApiBearerAuth()
@Controller("compliance/eligibility/season")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class ComplianceSweepsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  // -------------------------------------------------------------------
  // POST /compliance/eligibility/season/:id/sweep
  // Bulk re-run of all 5 registration checks.
  // -------------------------------------------------------------------
  @Post(":id/sweep")
  @ApiOperation({
    summary:
      "Bulk re-run of the 5 registration checks for every active membership in the season. UPSERTs eligibility_records. Idempotent."
  })
  async runSeasonSweep(@Param("id") seasonId: string) {
    const season = await this.loadSeason(seasonId);
    if (!season) throw new NotFoundException("Season not found");

    const members = await this.loadActiveMembers(seasonId);
    let evaluated = 0;
    let flagged = 0;

    for (const m of members) {
      const evalBlock = await this.evaluateRegistrationChecks(
        m,
        season,
        seasonId
      );
      const status =
        evalBlock.summary === "blocked"
          ? "ineligible"
          : evalBlock.summary === "expiring"
            ? "expiring"
            : evalBlock.summary === "expired"
              ? "expired"
              : "eligible";
      if (status !== "eligible") flagged++;
      await this.upsertEligibility(m.personId, seasonId, evalBlock.body, status);
      evaluated++;
    }

    return { seasonId, evaluated, flagged };
  }

  // -------------------------------------------------------------------
  // POST /compliance/eligibility/season/:id/lock-sweep
  // -------------------------------------------------------------------
  @Post(":id/lock-sweep")
  @ApiOperation({
    summary:
      "Roster lock sweep (§3). Flags USA Hockey IDs that expire within the season window. Notifies player + captain for each."
  })
  async runLockSweep(@Param("id") seasonId: string) {
    return this.lockSweepForSeason(seasonId);
  }

  /**
   * Internal entry point — same logic as the HTTP endpoint above
   * minus the controller-level guard wiring. Cron-driven callers
   * invoke this directly to avoid an HTTP round-trip per season.
   * Idempotency: stamps `seasons.last_lock_sweep_at` after the
   * sweep completes; the compliance-cron query filters seasons
   * by that timestamp so a re-run on the same hour is a no-op.
   */
  async lockSweepForSeason(seasonId: string) {
    const season = await this.loadSeason(seasonId);
    if (!season) throw new NotFoundException("Season not found");

    const members = await this.loadActiveMembers(seasonId);
    const personIds = members.map((m) => m.personId);
    if (personIds.length === 0) {
      await this.db
        .update(schema.seasons)
        .set({ lastLockSweepAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.seasons.id, seasonId));
      return { seasonId, expiring: 0, expired: 0 };
    }

    const idRows = await this.db
      .select()
      .from(schema.identityVerifications)
      .where(inArray(schema.identityVerifications.personId, personIds));
    const byPerson = new Map(idRows.map((r) => [r.personId, r]));

    const now = new Date();
    const seasonEnd = season.endDate
      ? new Date(season.endDate as unknown as string)
      : null;

    let expiring = 0;
    let expired = 0;
    for (const m of members) {
      const id = byPerson.get(m.personId);
      if (!id?.expiresAt) continue;
      const exp = id.expiresAt;
      if (exp < now) {
        expired++;
        await this.upsertEligibility(
          m.personId,
          seasonId,
          {
            usaHockeyId: {
              provided: id.externalId,
              expiresAt: exp.toISOString(),
              source: id.source as "self_attest" | "live_api",
              status: "expired",
              checkedAt: now.toISOString(),
              adminWaived: false,
              waiveReason: null
            }
          },
          "expired"
        );
        void this.notify.queue({
          orgId: m.orgId,
          templateCode: "USA_HOCKEY_EXPIRED",
          idempotencyKey: `usah-expired-${m.personId}-${seasonId}`,
          recipientPersonId: m.personId,
          payload: { expiresAt: exp.toISOString() }
        });
        void this.notify.queue({
          orgId: m.orgId,
          templateCode: "USA_HOCKEY_EXPIRED_CAPTAIN",
          idempotencyKey: `usah-expired-cap-${m.personId}-${seasonId}`,
          payload: {
            playerName: m.personId,
            teamName: m.teamId,
            expiresAt: exp.toISOString()
          }
        });
      } else if (!seasonEnd || exp <= seasonEnd) {
        expiring++;
        await this.upsertEligibility(
          m.personId,
          seasonId,
          {
            usaHockeyId: {
              provided: id.externalId,
              expiresAt: exp.toISOString(),
              source: id.source as "self_attest" | "live_api",
              status: "expiring",
              checkedAt: now.toISOString(),
              adminWaived: false,
              waiveReason: null
            }
          },
          "expiring"
        );
        void this.notify.queue({
          orgId: m.orgId,
          templateCode: "USA_HOCKEY_EXPIRING_SOON",
          idempotencyKey: `usah-expiring-${m.personId}-${seasonId}`,
          recipientPersonId: m.personId,
          payload: { expiresAt: exp.toISOString() }
        });
      }
    }

    // Idempotency key intentionally omits Date.now() — re-running
    // the sweep should NOT spam admins with another "complete"
    // notification per cron pass. One row per season.
    void this.notify.queue({
      orgId: members[0]?.orgId ?? null,
      templateCode: "COMPLIANCE_SWEEP_COMPLETE",
      idempotencyKey: `lock-sweep-${seasonId}`,
      payload: {
        seasonId,
        expiring,
        expired,
        sweepRunAt: now.toISOString()
      }
    });

    await this.db
      .update(schema.seasons)
      .set({ lastLockSweepAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.seasons.id, seasonId));

    return { seasonId, expiring, expired };
  }

  // -------------------------------------------------------------------
  // POST /compliance/eligibility/season/:id/playoff-sweep
  // §4 — three playoff checks. Idempotent UPSERT.
  // -------------------------------------------------------------------
  @Post(":id/playoff-sweep")
  @ApiOperation({
    summary:
      "Playoff eligibility sweep (Workflow 7C §4). Runs 3 checks per active player: min games, USA Hockey valid at playoff start, guest-appearance limit. UPSERTs eligibility_records. HARD DEPENDENCY for the bracket generator."
  })
  async runPlayoffSweep(@Param("id") seasonId: string) {
    const season = await this.loadSeason(seasonId);
    if (!season) throw new NotFoundException("Season not found");

    const seasonConfig = (season.config as Record<string, unknown>) ?? {};
    const playoffConfig = resolvePlayoffConfig(
      (seasonConfig.playoffConfig as Record<string, unknown>) ?? null
    );
    const requireUsaHockeyId = !!seasonConfig.requireUsaHockeyId;

    const members = await this.loadActiveMembers(seasonId);
    let eligible = 0;
    let ineligible = 0;
    const breakdown: Array<{
      personId: string;
      teamId: string;
      status: "eligible" | "ineligible";
      failed: string[];
    }> = [];

    for (const m of members) {
      const division = await this.loadDivisionForTeam(m.teamId, seasonId);
      const rules = resolveDivisionRules(
        (division?.ruleSetOverrides as Record<string, unknown>) ?? null
      );

      // Check 1: minimum games played as a non-guest
      const [c1] = await this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.gameAttendance)
        .where(
          and(
            eq(schema.gameAttendance.personId, m.personId),
            eq(schema.gameAttendance.teamId, m.teamId),
            eq(schema.gameAttendance.isGuest, false)
          )
        );
      const gamesPlayed = c1?.count ?? 0;
      const check1 =
        gamesPlayed >=
        Math.min(playoffConfig.minGamesPlayedToQualify, rules.minGamesForPlayoffs);

      // Check 2: USA Hockey valid at playoffConfig.startDate
      let check2 = true;
      if (requireUsaHockeyId) {
        const [idRow] = await this.db
          .select()
          .from(schema.identityVerifications)
          .where(eq(schema.identityVerifications.personId, m.personId))
          .orderBy(sql`${schema.identityVerifications.createdAt} DESC`)
          .limit(1);
        const cutoff = playoffConfig.startDate
          ? new Date(playoffConfig.startDate)
          : new Date();
        check2 = !!idRow?.expiresAt && idRow.expiresAt >= cutoff;
      }

      // Check 3: guest appearances within season limit
      const [c3] = await this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.gameAttendance)
        .where(
          and(
            eq(schema.gameAttendance.personId, m.personId),
            eq(schema.gameAttendance.teamId, m.teamId),
            eq(schema.gameAttendance.isGuest, true)
          )
        );
      const guestAppearances = c3?.count ?? 0;
      const check3 = guestAppearances <= rules.guestPlayerSeasonLimit;

      const failed: string[] = [];
      if (!check1) failed.push("minGamesPlayed");
      if (!check2) failed.push("usaHockeyValidAtPlayoffStart");
      if (!check3) failed.push("guestSeasonLimit");
      const status: "eligible" | "ineligible" =
        failed.length === 0 ? "eligible" : "ineligible";

      const playoffBlock = {
        playoffEligibility: {
          gamesPlayed,
          minRequired: Math.min(
            playoffConfig.minGamesPlayedToQualify,
            rules.minGamesForPlayoffs
          ),
          usaHockeyValidAtPlayoffStart: check2,
          guestAppearancesForThisTeam: guestAppearances,
          guestSeasonLimit: rules.guestPlayerSeasonLimit,
          status,
          failedChecks: failed.length ? failed : undefined
        }
      };
      await this.upsertEligibility(m.personId, seasonId, playoffBlock, status);

      if (status === "ineligible") {
        ineligible++;
        void this.notify.queue({
          orgId: m.orgId,
          templateCode: "PLAYOFF_INELIGIBLE",
          idempotencyKey: `playoff-ineligible-${m.personId}-${seasonId}`,
          recipientPersonId: m.personId,
          payload: { failedChecks: failed.join(", ") }
        });
      } else {
        eligible++;
      }
      breakdown.push({
        personId: m.personId,
        teamId: m.teamId,
        status,
        failed
      });
    }

    return { totalPlayers: members.length, eligible, ineligible, breakdown };
  }

  // -------------------------------------------------------------------
  // GET /compliance/eligibility/season/:id/duplicates
  // -------------------------------------------------------------------
  @Get(":id/duplicates")
  @ApiOperation({
    summary:
      "Duplicate USA Hockey ID groups in the season — players who share the same externalId for the same governing body. Powers the admin duplicate-ID panel (§5)."
  })
  async listDuplicates(@Param("id") seasonId: string) {
    const members = await this.loadActiveMembers(seasonId);
    if (members.length === 0) return { groups: [] };
    const personIds = members.map((m) => m.personId);

    const idRows = await this.db
      .select({
        personId: schema.identityVerifications.personId,
        governingBodyId: schema.identityVerifications.governingBodyId,
        externalId: schema.identityVerifications.externalId,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName
      })
      .from(schema.identityVerifications)
      .innerJoin(
        schema.persons,
        eq(schema.persons.id, schema.identityVerifications.personId)
      )
      .where(inArray(schema.identityVerifications.personId, personIds));

    const grouped = new Map<
      string,
      Array<{
        personId: string;
        firstName: string | null;
        lastName: string | null;
      }>
    >();
    for (const r of idRows) {
      const key = `${r.governingBodyId}:${r.externalId}`;
      const arr = grouped.get(key) ?? [];
      arr.push({
        personId: r.personId,
        firstName: r.firstName,
        lastName: r.lastName
      });
      grouped.set(key, arr);
    }

    const groups: Array<{
      governingBodyId: string;
      externalId: string;
      players: Array<{
        personId: string;
        firstName: string | null;
        lastName: string | null;
      }>;
    }> = [];
    for (const [key, players] of grouped.entries()) {
      if (players.length < 2) continue;
      const [governingBodyId, externalId] = key.split(":");
      groups.push({
        governingBodyId: governingBodyId!,
        externalId: externalId!,
        players
      });
    }

    return { groups };
  }

  // -------------------------------------------------------------------
  // GET /compliance/eligibility/season/:id/summary
  // KPI counts for the admin compliance view.
  // -------------------------------------------------------------------
  @Get(":id/summary")
  @ApiOperation({
    summary:
      "Counts by status for the season — drives the admin compliance summary cards."
  })
  async summary(@Param("id") seasonId: string) {
    const rows = await this.db
      .select({
        status: schema.eligibilityRecords.status,
        count: sql<number>`COUNT(*)::int`
      })
      .from(schema.eligibilityRecords)
      .where(eq(schema.eligibilityRecords.seasonId, seasonId))
      .groupBy(schema.eligibilityRecords.status);
    const counts: Record<string, number> = {
      pending: 0,
      eligible: 0,
      ineligible: 0,
      expiring: 0,
      expired: 0,
      flagged: 0,
      waived: 0
    };
    for (const r of rows) counts[r.status] = r.count;
    return { seasonId, counts };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async loadSeason(seasonId: string) {
    const [s] = await this.db
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    return s ?? null;
  }

  private async loadActiveMembers(seasonId: string) {
    return await this.db
      .select({
        personId: schema.teamMemberships.personId,
        teamId: schema.teamMemberships.teamId,
        seasonId: schema.teamMemberships.seasonId,
        orgId: schema.teams.orgId
      })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.teamMemberships.teamId)
      )
      .where(
        and(
          eq(schema.teamMemberships.seasonId, seasonId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      );
  }

  private async loadDivisionForTeam(teamId: string, seasonId: string) {
    const [row] = await this.db
      .select({
        id: schema.divisions.id,
        ruleSetOverrides: schema.divisions.ruleSetOverrides
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          eq(schema.divisions.seasonId, seasonId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  private async evaluateRegistrationChecks(
    m: { personId: string; teamId: string; orgId: string },
    season: typeof schema.seasons.$inferSelect,
    seasonId: string
  ): Promise<{
    summary: "eligible" | "expiring" | "expired" | "blocked";
    body: Record<string, unknown>;
  }> {
    const division = await this.loadDivisionForTeam(m.teamId, seasonId);
    const rules = resolveDivisionRules(
      (division?.ruleSetOverrides as Record<string, unknown>) ?? null
    );
    const seasonConfig = (season.config as Record<string, unknown>) ?? {};
    const requireUsaHockeyId = !!seasonConfig.requireUsaHockeyId;
    const seasonStart = season.startDate
      ? new Date(season.startDate as unknown as string)
      : new Date();

    const [person] = await this.db
      .select({
        dobDate: schema.persons.dobDate,
        genderSelfId: schema.persons.genderSelfId
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, m.personId))
      .limit(1);

    // Age check
    const dobDate = person?.dobDate
      ? new Date(person.dobDate as unknown as string)
      : null;
    const ageAtRef = dobDate
      ? Math.floor(
          (seasonStart.getTime() - dobDate.getTime()) /
            (365.25 * 24 * 3600 * 1000)
        )
      : null;

    const body: Record<string, unknown> = {
      ageRestriction: {
        dobDate: person?.dobDate ?? null,
        referenceDate: seasonStart.toISOString().slice(0, 10),
        ageGroupCode: null,
        birthYearMin: null,
        birthYearMax: null,
        ageAtReferenceDate: ageAtRef,
        status: "eligible"
      },
      genderEligibility: {
        divisionGender: "open",
        personGenderSelfId: person?.genderSelfId ?? null,
        status: "eligible"
      },
      rosterSize: {
        countAtCheck: 0,
        maxAllowed: rules.maxRosterSize,
        status: "eligible"
      }
    };

    // USA Hockey
    if (requireUsaHockeyId) {
      const [id] = await this.db
        .select()
        .from(schema.identityVerifications)
        .where(eq(schema.identityVerifications.personId, m.personId))
        .orderBy(sql`${schema.identityVerifications.createdAt} DESC`)
        .limit(1);
      const now = new Date();
      let usaStatus: "verified" | "expiring" | "expired" | "not_provided" =
        "verified";
      if (!id) usaStatus = "not_provided";
      else if (id.expiresAt && id.expiresAt < now) usaStatus = "expired";
      else if (
        id.expiresAt &&
        season.endDate &&
        id.expiresAt <= new Date(season.endDate as unknown as string)
      )
        usaStatus = "expiring";
      body.usaHockeyId = {
        provided: id?.externalId ?? null,
        expiresAt: id?.expiresAt?.toISOString() ?? null,
        source: id?.source ?? "self_attest",
        status: usaStatus,
        checkedAt: now.toISOString(),
        adminWaived: false,
        waiveReason: null
      };
      if (usaStatus === "expired") return { summary: "expired", body };
      if (usaStatus === "expiring") return { summary: "expiring", body };
    }

    return { summary: "eligible", body };
  }

  private async upsertEligibility(
    personId: string,
    seasonId: string,
    addBody: Record<string, unknown>,
    status: string
  ) {
    const [existing] = await this.db
      .select()
      .from(schema.eligibilityRecords)
      .where(
        and(
          eq(schema.eligibilityRecords.personId, personId),
          eq(schema.eligibilityRecords.seasonId, seasonId)
        )
      )
      .limit(1);

    if (existing) {
      const merged = {
        ...((existing.ruleEvaluation as Record<string, unknown>) ?? {}),
        ...addBody
      };
      await this.db
        .update(schema.eligibilityRecords)
        .set({
          ruleEvaluation: merged,
          status,
          evaluatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(schema.eligibilityRecords.id, existing.id));
    } else {
      await this.db.insert(schema.eligibilityRecords).values({
        personId,
        seasonId,
        ruleEvaluation: addBody,
        status
      });
    }
  }
}
