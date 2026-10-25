import {
  Controller,
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
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import {
  evaluateSeasonEligibility,
  resolveDivisionRules,
  resolvePlayoffConfig,
  suspensionInForce,
  sweepOutcome
} from "@sportspulse/kernel";
import { loadStandingSuspensions } from "../../game-operations/application/suspensions/suspension-rules";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { seasonVisible } from "../../../shared/auth/visibility";
import { NotificationService } from "../../communications/application/notification.service";
import { notifyAudience } from "../../../shared/audience/notify-audience";

const log = new Logger("ComplianceSweeps");

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
// Sweeps (POST) stay super admin; the summary and duplicate reads are
// open to scoped admins for seasons inside their scope (404 otherwise).
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
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
    const suspensions = await loadStandingSuspensions(
      this.db,
      members.map((m) => m.personId)
    );
    const counts: Record<string, number> = {};
    let evaluated = 0;
    let flagged = 0;
    let waivedKept = 0;
    let waivedWithFindings = 0;

    for (const m of members) {
      const result = await this.evaluateRegistrationChecks(
        m,
        season,
        seasonId,
        suspensions.filter((x) => x.personId === m.personId)
      );
      const written = await this.upsertEligibility(
        m.personId,
        seasonId,
        result.ruleEvaluation as Record<string, unknown>,
        result.status
      );
      if (written.keptWaiver) {
        waivedKept++;
        if (result.status !== "eligible") waivedWithFindings++;
      } else if (written.status !== "eligible") {
        flagged++;
      }
      counts[written.status] = (counts[written.status] ?? 0) + 1;
      evaluated++;
    }
    log.log(
      `season sweep season=${seasonId} evaluated=${evaluated} flagged=${flagged} waivedKept=${waivedKept} counts=${JSON.stringify(counts)}`
    );

    return { seasonId, evaluated, flagged, waivedKept, waivedWithFindings, counts };
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
    // Names for the captain email, which printed raw ids before.
    const names = await resolveEntityNames(this.db, [
      ...members.map((m) => ({ type: "person", id: m.personId })),
      ...members.map((m) => ({ type: "team", id: m.teamId }))
    ]);

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
        // The team's captains (COMP-19: this named no recipient before).
        await notifyAudience(this.db, this.notify, {
          orgId: m.orgId,
          target: { teamIds: [m.teamId] },
          audiences: ["captains"],
          templateCode: "USA_HOCKEY_EXPIRED_CAPTAIN",
          key: `usah-expired-cap-${m.personId}-${seasonId}`,
          payload: {
            playerName: names.get(`person:${m.personId}`) ?? "A player",
            teamName: names.get(`team:${m.teamId}`) ?? "your team",
            expiresAt: exp.toISOString()
          },
          excludePersonIds: [m.personId]
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

    // The season's admins (org, league, season), once per season each:
    // the key omits the time so a re-run does not send it again
    // (COMP-19: this named no recipient before and was never sent).
    const orgId = members[0]?.orgId;
    if (orgId) {
      await notifyAudience(this.db, this.notify, {
        orgId,
        target: { leagueIds: [season.leagueId], seasonIds: [seasonId] },
        audiences: ["all_admins"],
        templateCode: "COMPLIANCE_SWEEP_COMPLETE",
        key: `lock-sweep-${seasonId}`,
        payload: {
          seasonId,
          seasonName: season.name,
          expiring,
          expired,
          sweepRunAt: now.toISOString()
        }
      });
    }

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
    const standing = await loadStandingSuspensions(
      this.db,
      members.map((m) => m.personId)
    );
    const now = new Date();
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

      // Check 4: no suspension standing (UC-14, COMP-14)
      const check4 = !standing.some(
        (x) => x.personId === m.personId && suspensionInForce(x, now)
      );

      const failed: string[] = [];
      if (!check1) failed.push("minGamesPlayed");
      if (!check2) failed.push("usaHockeyValidAtPlayoffStart");
      if (!check3) failed.push("guestSeasonLimit");
      if (!check4) failed.push("suspended");
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
  async listDuplicates(@Param("id") seasonId: string, @UserScope() scope: UserScopeType) {
    if (!(await seasonVisible(this.db, scope, seasonId))) throw new NotFoundException("Season not found");
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
  async summary(@Param("id") seasonId: string, @UserScope() scope: UserScopeType) {
    if (!(await seasonVisible(this.db, scope, seasonId))) throw new NotFoundException("Season not found");
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
        ruleSetOverrides: schema.divisions.ruleSetOverrides,
        genderEligibility: schema.divisions.genderEligibility
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

  /**
   * Load the facts for one rostered player and let the kernel decide
   * (evaluateSeasonEligibility, COMP-14): missing data is pending, a
   * standing suspension is ineligible, a self-reported USA Hockey ID is
   * not verified.
   */
  private async evaluateRegistrationChecks(
    m: { personId: string; teamId: string; orgId: string },
    season: typeof schema.seasons.$inferSelect,
    seasonId: string,
    suspensions: Awaited<ReturnType<typeof loadStandingSuspensions>>
  ) {
    const division = await this.loadDivisionForTeam(m.teamId, seasonId);
    const rules = resolveDivisionRules(
      (division?.ruleSetOverrides as Record<string, unknown>) ?? null
    );
    const seasonConfig = (season.config as Record<string, unknown>) ?? {};
    const requireUsaHockeyId = !!seasonConfig.requireUsaHockeyId;

    const [person] = await this.db
      .select({
        dobDate: schema.persons.dobDate,
        genderSelfId: schema.persons.genderSelfId
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, m.personId))
      .limit(1);

    const [roster] = await this.db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, m.teamId),
          eq(schema.teamMemberships.seasonId, seasonId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      );

    const [id] = requireUsaHockeyId
      ? await this.db
          .select()
          .from(schema.identityVerifications)
          .where(eq(schema.identityVerifications.personId, m.personId))
          .orderBy(sql`${schema.identityVerifications.createdAt} DESC`)
          .limit(1)
      : [];

    return evaluateSeasonEligibility({
      now: new Date(),
      season: {
        startDate: season.startDate as unknown as string,
        endDate: (season.endDate as unknown as string) ?? null,
        requireUsaHockeyId
      },
      division: division
        ? {
            genderEligibility: division.genderEligibility,
            ageMinYears: rules.ageMinYears,
            ageMaxYears: rules.ageMaxYears,
            maxRosterSize: rules.maxRosterSize
          }
        : null,
      person: {
        dobDate: (person?.dobDate as unknown as string) ?? null,
        genderSelfId: person?.genderSelfId ?? null
      },
      rosterCount: roster?.n ?? 0,
      usaHockeyId: id
        ? {
            externalId: id.externalId,
            status: id.status,
            expiresAt: id.expiresAt,
            source: id.source
          }
        : null,
      suspensions
    });
  }

  /**
   * Merge a sweep's evaluation into the (person, season) record. An
   * admin's waiver is never overwritten (COMP-17): the evaluation is
   * recorded with a `lastSweep` note of what the status would have
   * been, and the status, reason and waiver columns stay as they are.
   */
  private async upsertEligibility(
    personId: string,
    seasonId: string,
    addBody: Record<string, unknown>,
    status: string
  ): Promise<{ status: string; keptWaiver: boolean }> {
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
      const outcome = sweepOutcome(existing.status, status);
      const merged = {
        ...((existing.ruleEvaluation as Record<string, unknown>) ?? {}),
        ...addBody,
        lastSweep: {
          at: new Date().toISOString(),
          evaluatedStatus: status,
          keptWaiver: outcome.keptWaiver
        }
      };
      const rows = await this.db
        .update(schema.eligibilityRecords)
        .set({
          ruleEvaluation: merged,
          status: outcome.status,
          evaluatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.eligibilityRecords.id, existing.id),
            // Never clobber a decision an admin saved after the read above.
            eq(schema.eligibilityRecords.status, existing.status)
          )
        )
        .returning({ id: schema.eligibilityRecords.id });
      if (rows.length !== 1) {
        log.warn(
          `sweep person=${personId} season=${seasonId}: record changed during the sweep, update touched ${rows.length} rows; left as is`
        );
        return { status: existing.status, keptWaiver: existing.status === "waived" };
      }
      if (outcome.keptWaiver) {
        log.log(`sweep person=${personId} season=${seasonId}: waiver kept (evaluation is ${status})`);
      }
      return outcome;
    }
    const rows = await this.db
      .insert(schema.eligibilityRecords)
      .values({
        personId,
        seasonId,
        ruleEvaluation: addBody,
        status
      })
      .returning({ id: schema.eligibilityRecords.id });
    if (rows.length !== 1) {
      log.warn(`sweep person=${personId} season=${seasonId}: insert wrote ${rows.length} rows`);
    }
    return { status, keptWaiver: false };
  }
}
