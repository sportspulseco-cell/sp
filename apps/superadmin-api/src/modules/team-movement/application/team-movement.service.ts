import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import { RecomputeStandingsHandler } from "../../stats/application/handlers/recompute-standings.handler";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Entry statuses that mean "this instance is live". */
export const LIVE_ENTRY_STATUSES = ["pending_approval", "applied", "accepted", "confirmed"] as const;
const CLOSED_ENTRY_STATUSES = ["rejected", "withdrawn", "disqualified", "moved"] as const;
const DEFAULT_MAX_ROSTER = 14;

export type MovementKind = "rollover" | "division_shift" | "league_migration" | "org_move";

export interface MovementActor {
  userId: string;
  /** Client-supplied key; the same key returns the first result instead of moving twice. */
  idempotencyKey?: string | null;
  reason?: string | null;
}

export interface EntryView {
  id: string;
  teamId: string;
  divisionId: string;
  divisionName: string;
  seasonId: string;
  seasonName: string;
  leagueId: string;
  leagueName: string;
  entryStatus: string;
  movementKind: string | null;
  previousEntryId: string | null;
  carryStandings: boolean;
  complianceFlags: Record<string, unknown>;
  joinedAt: string;
  leftAt: string | null;
}

export interface MovementView {
  id: string;
  teamId: string;
  kind: MovementKind;
  fromEntryId: string | null;
  toEntryId: string | null;
  fromDivisionId: string | null;
  fromDivisionName: string | null;
  toDivisionId: string | null;
  toDivisionName: string | null;
  fromOrgId: string | null;
  fromOrgName: string | null;
  toOrgId: string | null;
  toOrgName: string | null;
  resetStandings: boolean | null;
  rosterCopied: number;
  complianceFlags: Record<string, unknown>;
  reason: string | null;
  movedByUserId: string | null;
  movedByName: string | null;
  createdAt: string;
}

export interface MovementResult {
  movement: MovementView;
  /** The team's instance after the move (null for an org move). */
  entry: EntryView | null;
  /** Things the admin still has to do; mirrors movement.complianceFlags. */
  warnings: string[];
  /** Whether this call was answered from an earlier identical request. */
  replayed: boolean;
  standingsRecomputed?: boolean;
  standingsError?: string | null;
}

interface DivisionContext {
  division: { id: string; name: string; status: string; maxTeams: number | null; deletedAt: Date | null };
  season: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    leagueId: string;
    orgId: string;
    config: Record<string, unknown>;
  };
  league: { id: string; name: string; orgId: string };
}

/**
 * Moves a team between seasons, divisions, leagues and organisations
 * without rewriting history. The master team (`teams`) never changes
 * except for Rule D (org). Every other move closes the old instance
 * (`division_team_entries`) and creates a new one that links back.
 *
 * One transaction per move; row locks on the target division's entries
 * serialise two moves into the last free slot; an idempotency key makes a
 * retried request return the first result. Every write is read back
 * before it is returned. Nothing here touches games, stat lines or
 * invoices of the old instance.
 */
@Injectable()
export class TeamMovementService {
  private readonly log = new Logger(TeamMovementService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly recomputeStandings: RecomputeStandingsHandler
  ) {}

  // ------------------------------------------------------------------ reads

  async listEntries(teamId: string): Promise<EntryView[]> {
    const rows = await this.db
      .select({
        e: schema.divisionTeamEntries,
        divisionName: schema.divisions.name,
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        leagueId: schema.leagues.id,
        leagueName: schema.leagues.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .innerJoin(schema.leagues, eq(schema.leagues.id, schema.seasons.leagueId))
      .where(eq(schema.divisionTeamEntries.teamId, teamId))
      .orderBy(desc(schema.seasons.startDate), desc(schema.divisionTeamEntries.joinedAt));
    return rows.map((r) => this.toEntryView(r));
  }

  async history(teamId: string): Promise<MovementView[]> {
    const rows = await this.db
      .select()
      .from(schema.teamMovements)
      .where(eq(schema.teamMovements.teamId, teamId))
      .orderBy(desc(schema.teamMovements.createdAt));
    return this.toMovementViews(rows);
  }

  // ----------------------------------------------------------- Rule A

  /**
   * Rollover: clone the team into a division of a later season. The old
   * season's instance, roster, games and dues stay exactly as they are.
   */
  async rollover(input: {
    teamId: string;
    sourceEntryId?: string | null;
    targetDivisionId: string;
    copyRoster: boolean;
    actor: MovementActor;
  }): Promise<MovementResult> {
    const replay = await this.replayIfSeen(input.actor);
    if (replay) return replay;

    const team = await this.loadTeam(input.teamId);
    const target = await this.loadDivisionContext(input.targetDivisionId);
    this.assertSeasonOpenForEntries(target);

    const source = input.sourceEntryId
      ? await this.loadLiveEntry(input.sourceEntryId, team.id)
      : await this.latestLiveEntry(team.id);
    if (!source) {
      throw new UnprocessableEntityException(
        "This team has no live season to roll over from. Register it in a division first."
      );
    }
    const sourceCtx = await this.loadDivisionContext(source.divisionId);
    if (sourceCtx.season.id === target.season.id) {
      throw new UnprocessableEntityException(
        "Rollover needs a different season. To change division within the same season use a division shift."
      );
    }
    if (target.season.startDate <= sourceCtx.season.startDate) {
      throw new UnprocessableEntityException(
        `Target season "${target.season.name}" starts on ${target.season.startDate}, not after "${sourceCtx.season.name}" (${sourceCtx.season.startDate}). Rollover only moves forward.`
      );
    }

    const result = await this.db.transaction(async (tx) => {
      await this.lockDivisionAndAssertRoom(tx, target);
      await this.assertNoLiveEntryIn(tx, team.id, target.division.id);

      const [created] = await tx
        .insert(schema.divisionTeamEntries)
        .values({
          divisionId: target.division.id,
          teamId: team.id,
          entryStatus: "applied",
          confirmationThresholdCents: team.confirmationThresholdCents,
          collectedCents: 0,
          previousEntryId: source.id,
          movementKind: "rollover",
          complianceFlags: {
            duesNotCopied: true,
            sourceEntryId: source.id,
            sourceSeasonName: sourceCtx.season.name
          }
        })
        .returning({ id: schema.divisionTeamEntries.id });

      let rosterCopied = 0;
      if (input.copyRoster) {
        rosterCopied = await this.copyRoster(tx, {
          teamId: team.id,
          fromSeasonId: sourceCtx.season.id,
          toSeason: target.season
        });
      }

      const movement = await this.recordMovement(tx, {
        teamId: team.id,
        kind: "rollover",
        fromEntryId: source.id,
        toEntryId: created!.id,
        fromDivisionId: source.divisionId,
        toDivisionId: target.division.id,
        rosterCopied,
        complianceFlags: { duesNotCopied: true, rosterCopied },
        actor: input.actor
      });
      return { movementId: movement.id, entryId: created!.id, rosterCopied };
    });

    this.log.log(
      `rollover team=${team.id} from=${source.id} to=${result.entryId} roster=${result.rosterCopied} by=${input.actor.userId}`
    );
    return this.readback(result.movementId, result.entryId, [
      "Dues are not copied: create the new season's team invoice from the captain's setup or Finance.",
      ...(input.copyRoster ? [] : ["Roster was not copied."])
    ]);
  }

  // ----------------------------------------------------------- Rule B

  /**
   * Division shift within the same season. Before any game is played the
   * instance simply changes division. Once games exist the old instance
   * closes as `moved`, a new one opens, and standings either restart at
   * 0-0-0 (`resetStandings`) or carry the played games across.
   */
  async divisionShift(input: {
    teamId: string;
    entryId: string;
    targetDivisionId: string;
    resetStandings: boolean;
    actor: MovementActor;
  }): Promise<MovementResult> {
    const replay = await this.replayIfSeen(input.actor);
    if (replay) return replay;

    const team = await this.loadTeam(input.teamId);
    const source = await this.loadLiveEntry(input.entryId, team.id);
    const sourceCtx = await this.loadDivisionContext(source.divisionId);
    const target = await this.loadDivisionContext(input.targetDivisionId);
    if (target.division.id === source.divisionId) {
      throw new UnprocessableEntityException("The team is already in that division.");
    }
    if (target.season.id !== sourceCtx.season.id) {
      throw new UnprocessableEntityException(
        "A division shift stays inside one season. Use rollover (new season) or league migration (new league)."
      );
    }
    this.assertDivisionUsable(target);
    await this.assertNoGameInPlay(team.id);
    await this.assertNoScheduleRunInFlight([source.divisionId, target.division.id]);

    const played = await this.countGames(team.id, source.divisionId, ["completed", "forfeited"]);
    const scheduled = await this.countGames(team.id, source.divisionId, ["scheduled", "postponed"]);

    const result = await this.db.transaction(async (tx) => {
      await this.lockDivisionAndAssertRoom(tx, target);
      await this.assertNoLiveEntryIn(tx, team.id, target.division.id);

      const flags: Record<string, unknown> = {
        shiftedFromDivisionId: source.divisionId,
        shiftedFromDivisionName: sourceCtx.division.name,
        gamesPlayedBeforeShift: played
      };
      if (scheduled > 0) flags.scheduledGamesLeftInSourceDivision = scheduled;

      let entryId: string;
      if (played === 0) {
        // Pre-season: same instance, new division. Nothing to preserve yet.
        const [updated] = await tx
          .update(schema.divisionTeamEntries)
          .set({
            divisionId: target.division.id,
            movementKind: "division_shift",
            complianceFlags: sql`${schema.divisionTeamEntries.complianceFlags} || ${JSON.stringify(flags)}::jsonb`
          })
          .where(eq(schema.divisionTeamEntries.id, source.id))
          .returning({ id: schema.divisionTeamEntries.id });
        entryId = updated!.id;
      } else {
        // Mid-season: close the old instance, open a new one that carries
        // dues state; played games stay where they were played.
        await tx
          .update(schema.divisionTeamEntries)
          .set({ entryStatus: "moved", leftAt: new Date() })
          .where(eq(schema.divisionTeamEntries.id, source.id));
        const [created] = await tx
          .insert(schema.divisionTeamEntries)
          .values({
            divisionId: target.division.id,
            teamId: team.id,
            entryStatus: source.entryStatus,
            seedHint: source.seedHint,
            invoiceId: source.invoiceId,
            confirmationThresholdCents: source.confirmationThresholdCents,
            collectedCents: source.collectedCents,
            rosterSnapshot: source.rosterSnapshot,
            metadata: source.metadata,
            previousEntryId: source.id,
            movementKind: "division_shift",
            carryStandings: !input.resetStandings,
            complianceFlags: flags
          })
          .returning({ id: schema.divisionTeamEntries.id });
        entryId = created!.id;
      }

      const movement = await this.recordMovement(tx, {
        teamId: team.id,
        kind: "division_shift",
        fromEntryId: source.id,
        toEntryId: entryId,
        fromDivisionId: source.divisionId,
        toDivisionId: target.division.id,
        resetStandings: input.resetStandings,
        complianceFlags: flags,
        actor: input.actor
      });
      return { movementId: movement.id, entryId };
    });

    // Standings live in a derived table; rebuild the league's after commit
    // and say honestly if that part failed (the move itself is committed).
    let standingsRecomputed = false;
    let standingsError: string | null = null;
    try {
      await this.recomputeStandings.execute({ leagueId: sourceCtx.league.id });
      standingsRecomputed = true;
    } catch (e) {
      standingsError = (e as Error).message;
      this.log.error(`standings recompute after shift failed league=${sourceCtx.league.id}: ${standingsError}`);
    }

    this.log.log(
      `division_shift team=${team.id} from=${source.id} to=${result.entryId} played=${played} reset=${input.resetStandings} by=${input.actor.userId}`
    );
    const warnings = [
      ...(scheduled > 0
        ? [`${scheduled} scheduled game(s) still sit in ${sourceCtx.division.name}. Re-run the scheduler for both divisions.`]
        : []),
      ...(played > 0 && !input.resetStandings
        ? [`${played} played game(s) carry over into ${target.division.name}'s standings.`]
        : []),
      ...(played > 0 && input.resetStandings
        ? [`Standings restart at 0-0-0 in ${target.division.name}; the ${played} played game(s) stay on record in ${sourceCtx.division.name}.`]
        : []),
      ...(standingsError ? [`Standings were not recomputed: ${standingsError}. Run Recompute standings for the league.`] : [])
    ];
    const out = await this.readback(result.movementId, result.entryId, warnings);
    return { ...out, standingsRecomputed, standingsError };
  }

  // ----------------------------------------------------------- Rule C

  /**
   * League migration inside the same organisation. The old instance
   * closes as `moved`; the new one starts as `applied` with compliance
   * flags because fees and roster rules differ per league. Dues are never
   * moved automatically.
   */
  async leagueMigration(input: {
    teamId: string;
    entryId: string;
    targetDivisionId: string;
    actor: MovementActor;
  }): Promise<MovementResult> {
    const replay = await this.replayIfSeen(input.actor);
    if (replay) return replay;

    const team = await this.loadTeam(input.teamId);
    const source = await this.loadLiveEntry(input.entryId, team.id);
    const sourceCtx = await this.loadDivisionContext(source.divisionId);
    const target = await this.loadDivisionContext(input.targetDivisionId);
    if (target.league.id === sourceCtx.league.id) {
      throw new UnprocessableEntityException(
        "That division is in the same league. Use a division shift or a rollover."
      );
    }
    if (target.league.orgId !== team.orgId) {
      throw new UnprocessableEntityException(
        "The target league belongs to another organisation. Move the team to that organisation first (Rule D), then migrate."
      );
    }
    this.assertSeasonOpenForEntries(target);
    await this.assertNoGameInPlay(team.id);

    const flags: Record<string, unknown> = {
      feeScheduleReview: true,
      rosterRulesReview: true,
      duesNotMoved: true,
      rosterNotCopied: true,
      sourceEntryId: source.id,
      sourceInvoiceId: source.invoiceId,
      sourceLeagueName: sourceCtx.league.name,
      sourceSeasonName: sourceCtx.season.name
    };

    const result = await this.db.transaction(async (tx) => {
      await this.lockDivisionAndAssertRoom(tx, target);
      await this.assertNoLiveEntryIn(tx, team.id, target.division.id);
      await tx
        .update(schema.divisionTeamEntries)
        .set({ entryStatus: "moved", leftAt: new Date() })
        .where(eq(schema.divisionTeamEntries.id, source.id));
      const [created] = await tx
        .insert(schema.divisionTeamEntries)
        .values({
          divisionId: target.division.id,
          teamId: team.id,
          entryStatus: "applied",
          confirmationThresholdCents: team.confirmationThresholdCents,
          collectedCents: 0,
          previousEntryId: source.id,
          movementKind: "league_migration",
          complianceFlags: flags
        })
        .returning({ id: schema.divisionTeamEntries.id });
      const movement = await this.recordMovement(tx, {
        teamId: team.id,
        kind: "league_migration",
        fromEntryId: source.id,
        toEntryId: created!.id,
        fromDivisionId: source.divisionId,
        toDivisionId: target.division.id,
        complianceFlags: flags,
        actor: input.actor
      });
      return { movementId: movement.id, entryId: created!.id };
    });

    this.log.log(
      `league_migration team=${team.id} from=${source.id} to=${result.entryId} by=${input.actor.userId}`
    );
    return this.readback(result.movementId, result.entryId, [
      `Check ${target.league.name}'s fee schedule: dues from ${sourceCtx.league.name} were not moved.`,
      `Re-check roster rules for ${target.league.name}; the roster was not copied.`
    ]);
  }

  // ----------------------------------------------------------- Rule D

  /**
   * Organisation move: the master team changes owner. Refused while the
   * team still has live instances in the old org's leagues, unless forced,
   * because those leagues' admins would lose sight of a team still playing
   * for them. Captain and coach roles are team-scoped and survive.
   */
  async orgMove(input: {
    teamId: string;
    targetOrgId: string;
    force: boolean;
    actor: MovementActor;
  }): Promise<MovementResult> {
    const replay = await this.replayIfSeen(input.actor);
    if (replay) return replay;

    const team = await this.loadTeam(input.teamId);
    if (team.orgId === input.targetOrgId) {
      throw new UnprocessableEntityException("The team already belongs to that organisation.");
    }
    const [targetOrg] = await this.db
      .select({ id: schema.orgs.id, name: schema.orgs.displayName, status: schema.orgs.status })
      .from(schema.orgs)
      .where(eq(schema.orgs.id, input.targetOrgId))
      .limit(1);
    if (!targetOrg) throw new NotFoundException("Target organisation not found");
    if (targetOrg.status !== "active") {
      throw new UnprocessableEntityException(`Organisation "${targetOrg.name}" is ${targetOrg.status}.`);
    }

    const liveInOldOrg = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.divisionTeamEntries)
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, team.id),
          eq(schema.seasons.orgId, team.orgId),
          inArray(schema.divisionTeamEntries.entryStatus, [...LIVE_ENTRY_STATUSES]),
          sql`${schema.seasons.status} NOT IN ('completed','archived')`
        )
      );
    const n = liveInOldOrg[0]?.n ?? 0;
    if (n > 0 && !input.force) {
      throw new ConflictException(
        `The team still plays in ${n} live season(s) of its current organisation. Finish or move those first, or force the move.`
      );
    }

    const flags: Record<string, unknown> = { liveEntriesLeftInSourceOrg: n, forced: input.force && n > 0 };
    const result = await this.db.transaction(async (tx) => {
      await tx
        .update(schema.teams)
        .set({ orgId: input.targetOrgId, updatedAt: new Date() })
        .where(eq(schema.teams.id, team.id));
      const movement = await this.recordMovement(tx, {
        teamId: team.id,
        kind: "org_move",
        fromOrgId: team.orgId,
        toOrgId: input.targetOrgId,
        complianceFlags: flags,
        actor: input.actor
      });
      return { movementId: movement.id };
    });

    this.log.log(
      `org_move team=${team.id} from=${team.orgId} to=${input.targetOrgId} live_left=${n} forced=${input.force} by=${input.actor.userId}`
    );
    return this.readback(result.movementId, null, [
      ...(n > 0 ? [`${n} live season(s) stay under the old organisation's leagues; their admins no longer see this team.`] : []),
      "Admins of the old organisation lose access; captain and coach roles are unchanged."
    ]);
  }

  // ---------------------------------------------------------- helpers

  private async replayIfSeen(actor: MovementActor): Promise<MovementResult | null> {
    if (!actor.idempotencyKey) return null;
    const [m] = await this.db
      .select()
      .from(schema.teamMovements)
      .where(eq(schema.teamMovements.idempotencyKey, actor.idempotencyKey))
      .limit(1);
    if (!m) return null;
    const out = await this.readback(m.id, m.toEntryId, []);
    return { ...out, replayed: true };
  }

  private async loadTeam(teamId: string) {
    const [t] = await this.db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        orgId: schema.teams.orgId,
        status: schema.teams.status,
        confirmationThresholdCents: schema.teams.confirmationThresholdCents
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!t) throw new NotFoundException("Team not found");
    if (t.status !== "active") {
      throw new UnprocessableEntityException(`Team "${t.name}" is ${t.status}; only active teams move.`);
    }
    return t;
  }

  private async loadDivisionContext(divisionId: string): Promise<DivisionContext> {
    const [row] = await this.db
      .select({
        division: {
          id: schema.divisions.id,
          name: schema.divisions.name,
          status: schema.divisions.status,
          maxTeams: schema.divisions.maxTeams,
          deletedAt: schema.divisions.deletedAt
        },
        season: {
          id: schema.seasons.id,
          name: schema.seasons.name,
          status: schema.seasons.status,
          startDate: schema.seasons.startDate,
          leagueId: schema.seasons.leagueId,
          orgId: schema.seasons.orgId,
          config: schema.seasons.config
        },
        league: { id: schema.leagues.id, name: schema.leagues.name, orgId: schema.leagues.orgId }
      })
      .from(schema.divisions)
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .innerJoin(schema.leagues, eq(schema.leagues.id, schema.seasons.leagueId))
      .where(eq(schema.divisions.id, divisionId))
      .limit(1);
    if (!row) throw new NotFoundException("Division not found");
    return {
      ...row,
      season: { ...row.season, config: (row.season.config ?? {}) as Record<string, unknown> }
    };
  }

  private assertDivisionUsable(ctx: DivisionContext) {
    if (ctx.division.deletedAt || ctx.division.status !== "active") {
      throw new UnprocessableEntityException(`Division "${ctx.division.name}" is archived.`);
    }
  }

  private assertSeasonOpenForEntries(ctx: DivisionContext) {
    this.assertDivisionUsable(ctx);
    if (ctx.season.status === "completed" || ctx.season.status === "archived") {
      throw new UnprocessableEntityException(
        `Season "${ctx.season.name}" is ${ctx.season.status}; teams cannot be added to it.`
      );
    }
  }

  private async loadLiveEntry(entryId: string, teamId: string) {
    const [e] = await this.db
      .select()
      .from(schema.divisionTeamEntries)
      .where(and(eq(schema.divisionTeamEntries.id, entryId), eq(schema.divisionTeamEntries.teamId, teamId)))
      .limit(1);
    if (!e) throw new NotFoundException("Team entry not found");
    if (!(LIVE_ENTRY_STATUSES as readonly string[]).includes(e.entryStatus)) {
      throw new UnprocessableEntityException(
        `This entry is ${e.entryStatus}; only a live entry (pending approval, applied, accepted or confirmed) can move.`
      );
    }
    return e;
  }

  private async latestLiveEntry(teamId: string) {
    const [row] = await this.db
      .select({ e: schema.divisionTeamEntries })
      .from(schema.divisionTeamEntries)
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          inArray(schema.divisionTeamEntries.entryStatus, [...LIVE_ENTRY_STATUSES])
        )
      )
      .orderBy(desc(schema.seasons.startDate), desc(schema.divisionTeamEntries.joinedAt))
      .limit(1);
    return row?.e ?? null;
  }

  /** Row-locks the target division's live entries and checks maxTeams. */
  private async lockDivisionAndAssertRoom(tx: Tx, ctx: DivisionContext) {
    await tx.execute(sql`
      SELECT id FROM division_team_entries
      WHERE division_id = ${ctx.division.id}
        AND entry_status NOT IN ('rejected','withdrawn','disqualified','moved')
      FOR UPDATE
    `);
    if (ctx.division.maxTeams === null) return;
    const [c] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.divisionTeamEntries)
      .where(
        and(
          eq(schema.divisionTeamEntries.divisionId, ctx.division.id),
          sql`${schema.divisionTeamEntries.entryStatus} NOT IN ('rejected','withdrawn','disqualified','moved')`
        )
      );
    const n = c?.n ?? 0;
    if (n >= ctx.division.maxTeams) {
      throw new ConflictException(
        `Division "${ctx.division.name}" is full (${n} of ${ctx.division.maxTeams} teams).`
      );
    }
  }

  private async assertNoLiveEntryIn(tx: Tx, teamId: string, divisionId: string) {
    const [dup] = await tx
      .select({ id: schema.divisionTeamEntries.id })
      .from(schema.divisionTeamEntries)
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          eq(schema.divisionTeamEntries.divisionId, divisionId),
          sql`${schema.divisionTeamEntries.entryStatus} NOT IN ('rejected','withdrawn','disqualified','moved')`
        )
      )
      .limit(1);
    if (dup) throw new ConflictException("The team already has a live entry in that division.");
  }

  private async assertNoGameInPlay(teamId: string) {
    const [g] = await this.db
      .select({ id: schema.games.id })
      .from(schema.games)
      .where(
        and(
          eq(schema.games.status, "in_play"),
          or(eq(schema.games.homeTeamId, teamId), eq(schema.games.awayTeamId, teamId))
        )
      )
      .limit(1);
    if (g) throw new ConflictException("The team has a game in play right now. Try again after it ends.");
  }

  private async assertNoScheduleRunInFlight(divisionIds: string[]) {
    const [r] = await this.db
      .select({ id: schema.scheduleRuns.id })
      .from(schema.scheduleRuns)
      .where(
        and(
          inArray(schema.scheduleRuns.divisionId, divisionIds),
          inArray(schema.scheduleRuns.status, ["queued", "running"])
        )
      )
      .limit(1);
    if (r) {
      throw new ConflictException("A schedule is being generated for one of these divisions. Wait for it to finish.");
    }
  }

  private async countGames(teamId: string, divisionId: string, statuses: string[]) {
    const [c] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.games)
      .where(
        and(
          eq(schema.games.divisionId, divisionId),
          inArray(schema.games.status, statuses),
          or(eq(schema.games.homeTeamId, teamId), eq(schema.games.awayTeamId, teamId))
        )
      );
    return c?.n ?? 0;
  }

  /**
   * Copies the active roster of `fromSeasonId` into the target season.
   * Refuses (nothing written) when the roster exceeds the target season's
   * cap, so an admin decides who stays instead of the code guessing.
   */
  private async copyRoster(
    tx: Tx,
    input: { teamId: string; fromSeasonId: string; toSeason: DivisionContext["season"] }
  ): Promise<number> {
    const source = await tx
      .select({
        personId: schema.teamMemberships.personId,
        membershipType: schema.teamMemberships.membershipType,
        jerseyNumber: schema.teamMemberships.jerseyNumber,
        positionCode: schema.teamMemberships.positionCode
      })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, input.teamId),
          eq(schema.teamMemberships.seasonId, input.fromSeasonId),
          eq(schema.teamMemberships.currentStatus, "active"),
          isNull(schema.teamMemberships.effectiveTo)
        )
      );
    if (source.length === 0) return 0;

    const already = await tx
      .select({ personId: schema.teamMemberships.personId })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, input.teamId),
          eq(schema.teamMemberships.seasonId, input.toSeason.id),
          isNull(schema.teamMemberships.effectiveTo)
        )
      );
    const present = new Set(already.map((a) => a.personId));
    const toCopy = source.filter((m) => !present.has(m.personId));
    const cap = Number(input.toSeason.config.maxRosterSize ?? DEFAULT_MAX_ROSTER);
    if (present.size + toCopy.length > cap) {
      throw new ConflictException(
        `Copying the roster would put ${present.size + toCopy.length} players on a ${cap}-player roster for "${input.toSeason.name}". Roll over without the roster and add players by hand.`
      );
    }
    if (toCopy.length === 0) return 0;
    const now = new Date();
    const inserted = await tx
      .insert(schema.teamMemberships)
      .values(
        toCopy.map((m) => ({
          teamId: input.teamId,
          personId: m.personId,
          seasonId: input.toSeason.id,
          membershipType: m.membershipType,
          effectiveFrom: now,
          jerseyNumber: m.jerseyNumber,
          positionCode: m.positionCode,
          currentStatus: "active"
        }))
      )
      .returning({ id: schema.teamMemberships.id });
    return inserted.length;
  }

  private async recordMovement(
    tx: Tx,
    m: {
      teamId: string;
      kind: MovementKind;
      fromEntryId?: string | null;
      toEntryId?: string | null;
      fromDivisionId?: string | null;
      toDivisionId?: string | null;
      fromOrgId?: string | null;
      toOrgId?: string | null;
      resetStandings?: boolean | null;
      rosterCopied?: number;
      complianceFlags: Record<string, unknown>;
      actor: MovementActor;
    }
  ) {
    const [row] = await tx
      .insert(schema.teamMovements)
      .values({
        teamId: m.teamId,
        kind: m.kind,
        fromEntryId: m.fromEntryId ?? null,
        toEntryId: m.toEntryId ?? null,
        fromDivisionId: m.fromDivisionId ?? null,
        toDivisionId: m.toDivisionId ?? null,
        fromOrgId: m.fromOrgId ?? null,
        toOrgId: m.toOrgId ?? null,
        resetStandings: m.resetStandings ?? null,
        rosterCopied: m.rosterCopied ?? 0,
        complianceFlags: m.complianceFlags,
        reason: m.actor.reason?.trim() || null,
        movedByUserId: m.actor.userId,
        idempotencyKey: m.actor.idempotencyKey ?? null
      })
      .returning({ id: schema.teamMovements.id });
    return row!;
  }

  /** Post-write readback: what the database holds now, with names. */
  private async readback(
    movementId: string,
    entryId: string | null,
    warnings: string[]
  ): Promise<MovementResult> {
    const [m] = await this.db
      .select()
      .from(schema.teamMovements)
      .where(eq(schema.teamMovements.id, movementId))
      .limit(1);
    if (!m) throw new Error(`team_movements ${movementId} missing after write`);
    const [movement] = await this.toMovementViews([m]);
    let entry: EntryView | null = null;
    if (entryId) {
      const entries = await this.listEntries(m.teamId);
      entry = entries.find((e) => e.id === entryId) ?? null;
      if (!entry) throw new Error(`division_team_entries ${entryId} missing after write`);
    }
    return { movement: movement!, entry, warnings, replayed: false };
  }

  private toEntryView(r: {
    e: typeof schema.divisionTeamEntries.$inferSelect;
    divisionName: string;
    seasonId: string;
    seasonName: string;
    leagueId: string;
    leagueName: string;
  }): EntryView {
    return {
      id: r.e.id,
      teamId: r.e.teamId,
      divisionId: r.e.divisionId,
      divisionName: r.divisionName,
      seasonId: r.seasonId,
      seasonName: r.seasonName,
      leagueId: r.leagueId,
      leagueName: r.leagueName,
      entryStatus: r.e.entryStatus,
      movementKind: r.e.movementKind,
      previousEntryId: r.e.previousEntryId,
      carryStandings: r.e.carryStandings,
      complianceFlags: (r.e.complianceFlags ?? {}) as Record<string, unknown>,
      joinedAt: r.e.joinedAt.toISOString(),
      leftAt: r.e.leftAt ? r.e.leftAt.toISOString() : null
    };
  }

  private async toMovementViews(
    rows: Array<typeof schema.teamMovements.$inferSelect>
  ): Promise<MovementView[]> {
    const names = await resolveEntityNames(this.db, [
      ...rows.flatMap((r) => [
        { type: "division", id: r.fromDivisionId },
        { type: "division", id: r.toDivisionId },
        { type: "org", id: r.fromOrgId },
        { type: "org", id: r.toOrgId },
        { type: "user", id: r.movedByUserId }
      ])
    ]);
    const n = (type: string, id: string | null) => (id ? names.get(`${type}:${id}`) ?? null : null);
    return rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      kind: r.kind as MovementKind,
      fromEntryId: r.fromEntryId,
      toEntryId: r.toEntryId,
      fromDivisionId: r.fromDivisionId,
      fromDivisionName: n("division", r.fromDivisionId),
      toDivisionId: r.toDivisionId,
      toDivisionName: n("division", r.toDivisionId),
      fromOrgId: r.fromOrgId,
      fromOrgName: n("org", r.fromOrgId),
      toOrgId: r.toOrgId,
      toOrgName: n("org", r.toOrgId),
      resetStandings: r.resetStandings,
      rosterCopied: r.rosterCopied,
      complianceFlags: (r.complianceFlags ?? {}) as Record<string, unknown>,
      reason: r.reason,
      movedByUserId: r.movedByUserId,
      movedByName: n("user", r.movedByUserId),
      createdAt: r.createdAt.toISOString()
    }));
  }
}

export { CLOSED_ENTRY_STATUSES };
