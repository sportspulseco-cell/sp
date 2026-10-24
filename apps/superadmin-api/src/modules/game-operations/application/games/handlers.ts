import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  ConflictError,
  DomainError,
  GAME_ENDING_LABELS,
  ValidationError,
  checkFinalResult,
  clampLimit,
  isValidTimeZone,
  NotFoundError,
  utcToZonedWallTime,
  zonedWallTimeToUtc,
  type CommandHandler,
  type GameEnding,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  GAME_REPOSITORY,
  type GameRepository
} from "../../domain/repositories/game.repository";
import { GameId } from "../../domain/identifiers";
import { Game } from "../../domain/entities/game.entity";
import { GameDto, GamePageDto } from "../dtos/game.dto";
import { NotificationService } from "../../../communications/application/notification.service";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../../shared/display/entity-names";
import {
  gameUpdateValues,
  rowToGame
} from "../../infrastructure/repositories/drizzle-game.repository";
import {
  projectGameStats,
  recomputeLeagueStandings,
  type Tx
} from "../../../stats/application/projections";
import {
  gameNoticeContext,
  gameTimeLabel,
  queueGameNotice,
  type GameNoticeResult
} from "./game-notifications";

const log = new Logger("GameCommands");

export interface ListGamesInput {
  limit?: number;
  cursor?: string;
  leagueId?: string;
  divisionId?: string;
  teamId?: string;
  status?: string;
  fromTs?: string;
  toTs?: string;
  leagueIdsFilter?: string[];
  /** When true, restrict to games with `published_at IS NOT NULL`. */
  publishedOnly?: boolean;
}

@Injectable()
export class ListGamesHandler
  implements QueryHandler<ListGamesInput, GamePageDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: ListGamesInput): Promise<GamePageDto> {
    if (input.leagueIdsFilter && input.leagueIdsFilter.length === 0) {
      return { items: [], nextCursor: null };
    }
    const page = await this.games.list({
      ...input,
      limit: clampLimit(input.limit),
      fromTs: input.fromTs ? new Date(input.fromTs) : undefined,
      toTs: input.toTs ? new Date(input.toTs) : undefined
    });
    return {
      items: page.items.map(GameDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetGameHandler
  implements QueryHandler<{ id: string; leagueIdsFilter?: string[] }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: { id: string; leagueIdsFilter?: string[] }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    if (input.leagueIdsFilter && !input.leagueIdsFilter.includes(g.leagueId)) {
      throw new NotFoundError("Game", input.id);
    }
    return GameDto.fromDomain(g);
  }
}

export interface CreateGameInput {
  leagueId: string;
  seasonId?: string | null;
  divisionId?: string | null;
  homeTeamId: string;
  awayTeamId: string;
  sportCode: string;
  scheduledStartTsUtc: string;
  tz?: string;
  durationMin?: number;
  venueName?: string | null;
  surfaceLabel?: string | null;
  /** Show on team schedules right away (SCH-7). Default false = draft. */
  publish?: boolean;
}

@Injectable()
export class CreateGameHandler
  implements CommandHandler<CreateGameInput, GameDto>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}
  async execute(input: CreateGameInput): Promise<GameDto> {
    const g = Game.create({
      id: GameId.of(randomUUID()),
      leagueId: input.leagueId,
      seasonId: input.seasonId,
      divisionId: input.divisionId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      sportCode: input.sportCode,
      scheduledStartTsUtc: new Date(input.scheduledStartTsUtc),
      tz: input.tz,
      durationMin: input.durationMin,
      venueName: input.venueName,
      surfaceLabel: input.surfaceLabel
    });
    if (input.publish) g.publish();
    await this.games.insert(g);
    const saved = await this.games.findById(g.id);
    if (!saved) throw new Error(`game ${g.id.value} not found after insert`);
    if (saved.publishedAt) await notifyScheduled(this.db, this.notify, saved);
    return GameDto.fromDomain(saved);
  }
}

async function notifyScheduled(
  db: Database,
  notify: NotificationService,
  g: Game
): Promise<GameNoticeResult> {
  const target = {
    id: g.id.value,
    leagueId: g.leagueId,
    seasonId: g.seasonId,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId
  };
  const ctx = await gameNoticeContext(db, target);
  return queueGameNotice(db, notify, {
    game: target,
    templateCode: "game.scheduled",
    eventKey: `game.scheduled:${g.id.value}:${g.publishedAt?.toISOString() ?? ""}`,
    orgId: ctx.orgId,
    payload: {
      homeTeam: ctx.homeTeam,
      awayTeam: ctx.awayTeam,
      whenLabel: gameTimeLabel(g.scheduledStartTsUtc, g.tz),
      venueClause: g.venueName
        ? ` at ${g.venueName}${g.surfaceLabel ? `, ${g.surfaceLabel}` : ""}`
        : ""
    }
  });
}

/** Lock the game row for the rest of the transaction and load it. */
async function lockGame(tx: Tx, id: string): Promise<Game> {
  const [row] = await tx
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, id))
    .for("update");
  if (!row) throw new NotFoundError("Game", id);
  return rowToGame(row);
}

/** Write the aggregate back only if its status is still `expected`. */
async function saveIfStatus(tx: Tx, g: Game, expected: string): Promise<void> {
  const rows = await tx
    .update(schema.games)
    .set(gameUpdateValues(g.toSnapshot()))
    .where(and(eq(schema.games.id, g.id.value), eq(schema.games.status, expected)))
    .returning({ id: schema.games.id });
  if (rows.length !== 1) {
    log.warn(`game ${g.id.value}: expected status ${expected}, update touched ${rows.length} rows`);
    throw new ConflictError("This game changed while you were working on it. Reload and try again.");
  }
}

@Injectable()
export class PublishGameHandler
  implements CommandHandler<{ id: string }, GameDto & { notificationsQueued: number }>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}
  async execute(input: { id: string }): Promise<GameDto & { notificationsQueued: number }> {
    const changed = await this.db.transaction(async (tx) => {
      const g = await lockGame(tx, input.id);
      const status = g.status;
      const didPublish = g.publish();
      if (didPublish) await saveIfStatus(tx, g, status);
      return didPublish;
    });
    const fresh = await this.games.findById(GameId.of(input.id));
    if (!fresh?.publishedAt) throw new Error(`game ${input.id}: published_at missing after publish`);
    const notices = changed
      ? await notifyScheduled(this.db, this.notify, fresh)
      : { recipients: 0, queued: 0 };
    log.log(`publish game=${input.id} changed=${changed} queued=${notices.queued}`);
    return { ...GameDto.fromDomain(fresh), notificationsQueued: notices.queued };
  }
}

// ---------------------------------------------------------------------
// Reschedule (UC-07 manual override, SCH-6)
// ---------------------------------------------------------------------

export interface RescheduleInput {
  id: string;
  /** "YYYY-MM-DDTHH:MM" rink-local; omit to keep the time. */
  startLocal?: string;
  /** Rink to move to; omit to keep the rink. */
  surfaceId?: string;
  force?: boolean;
  reason?: string;
  userId: string;
}

export interface RescheduleConflict {
  kind: "rink" | "team";
  gameId: string;
  message: string;
}

export interface ReschedulePlan {
  startTsUtc: string;
  startLocal: string;
  tz: string;
  venueName: string | null;
  surfaceLabel: string | null;
  surfaceId: string | null;
  durationMin: number;
  conflicts: RescheduleConflict[];
}

type Exec = Database | Tx;

/**
 * Work out where and when the game would be, and what it would clash
 * with: another live game on the same rink in an overlapping window, or
 * either team already playing in an overlapping window. Same two hard
 * constraints the scheduler enforces (no_venue_double_book,
 * no_team_overlap), checked across every league so a team is never in
 * two places at once.
 */
async function planMove(exec: Exec, g: Game, input: RescheduleInput): Promise<ReschedulePlan> {
  if (!input.startLocal && !input.surfaceId) {
    throw new ValidationError("Pick a new date and time, a new rink, or both.");
  }
  let tz = g.tz;
  let venueName = g.venueName;
  let surfaceLabel = g.surfaceLabel;
  let surfaceId = g.surfaceId;

  if (input.surfaceId) {
    const [surface] = await exec
      .select({
        id: schema.surfaces.id,
        label: schema.surfaces.label,
        venueName: schema.venues.name,
        timezone: schema.venues.timezone,
        venueOrgId: schema.venues.orgId
      })
      .from(schema.surfaces)
      .innerJoin(schema.venues, eq(schema.venues.id, schema.surfaces.venueId))
      .where(
        and(
          eq(schema.surfaces.id, input.surfaceId),
          isNull(schema.surfaces.deletedAt),
          isNull(schema.venues.deletedAt)
        )
      )
      .limit(1);
    if (!surface) throw new NotFoundError("Rink", input.surfaceId);
    const [league] = await exec
      .select({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, g.leagueId))
      .limit(1);
    if (!league || surface.venueOrgId !== league.orgId) {
      throw new ValidationError("That rink belongs to another organisation. Pick one of this league's rinks.");
    }
    tz = surface.timezone;
    venueName = surface.venueName;
    surfaceLabel = surface.label;
    surfaceId = surface.id;
  }

  if (!isValidTimeZone(tz)) {
    throw new ValidationError(
      `This game's time zone "${tz}" is not a real time zone. Pick a rink so the game takes the rink's time zone.`
    );
  }
  const startLocal = input.startLocal ?? utcToZonedWallTime(g.scheduledStartTsUtc, tz);
  let start: Date;
  try {
    start = zonedWallTimeToUtc(startLocal, tz);
  } catch (err) {
    throw new ValidationError((err as Error).message);
  }

  const unchanged =
    start.getTime() === g.scheduledStartTsUtc.getTime() && surfaceId === g.surfaceId;
  if (unchanged) throw new ValidationError("That is the game's current time and rink. Nothing to change.");

  const end = new Date(start.getTime() + g.durationMin * 60_000);
  const overlaps = sql`${schema.games.scheduledStartTsUtc} < ${end.toISOString()}::timestamptz
    and ${schema.games.scheduledStartTsUtc} + make_interval(mins => ${schema.games.durationMin}::int) > ${start.toISOString()}::timestamptz`;
  const live = notInArray(schema.games.status, ["cancelled", "postponed"]);

  const clashes = await exec
    .select({
      id: schema.games.id,
      homeTeamId: schema.games.homeTeamId,
      awayTeamId: schema.games.awayTeamId,
      surfaceId: schema.games.surfaceId,
      start: schema.games.scheduledStartTsUtc,
      tz: schema.games.tz
    })
    .from(schema.games)
    .where(
      and(
        ne(schema.games.id, g.id.value),
        live,
        overlaps,
        or(
          ...(surfaceId ? [eq(schema.games.surfaceId, surfaceId)] : []),
          inArray(schema.games.homeTeamId, [g.homeTeamId, g.awayTeamId]),
          inArray(schema.games.awayTeamId, [g.homeTeamId, g.awayTeamId])
        )
      )
    );

  const names = await resolveEntityNames(
    exec as Database,
    clashes.flatMap((c) => [
      { type: "team", id: c.homeTeamId },
      { type: "team", id: c.awayTeamId }
    ]).concat([
      { type: "team", id: g.homeTeamId },
      { type: "team", id: g.awayTeamId }
    ])
  );
  const team = (id: string) => names.get(`team:${id}`) ?? "another team";
  const conflicts: RescheduleConflict[] = [];
  for (const c of clashes) {
    const when = gameTimeLabel(c.start, tz);
    const matchup = `${team(c.awayTeamId)} at ${team(c.homeTeamId)}`;
    if (surfaceId && c.surfaceId === surfaceId) {
      conflicts.push({
        kind: "rink",
        gameId: c.id,
        message: `${venueName ?? "This rink"}${surfaceLabel ? `, ${surfaceLabel}` : ""} is already booked for ${matchup} at ${when}.`
      });
    }
    for (const t of [g.homeTeamId, g.awayTeamId]) {
      if (c.homeTeamId === t || c.awayTeamId === t) {
        conflicts.push({
          kind: "team",
          gameId: c.id,
          message: `${team(t)} already have a game then: ${matchup} at ${when}.`
        });
      }
    }
  }

  return {
    startTsUtc: start.toISOString(),
    startLocal,
    tz,
    venueName,
    surfaceLabel,
    surfaceId,
    durationMin: g.durationMin,
    conflicts
  };
}

@Injectable()
export class PreviewRescheduleHandler
  implements CommandHandler<RescheduleInput, ReschedulePlan>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository, @Inject(DRIZZLE) private readonly db: Database) {}
  async execute(input: RescheduleInput): Promise<ReschedulePlan> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    if (g.status !== "scheduled" && g.status !== "postponed") {
      throw new DomainError("GAME_NOT_MOVABLE", "Only a scheduled or postponed game can be moved.");
    }
    return planMove(this.db, g, input);
  }
}

@Injectable()
export class RescheduleGameHandler
  implements CommandHandler<RescheduleInput, GameDto & { plan: ReschedulePlan; notificationsQueued: number }>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  async execute(
    input: RescheduleInput
  ): Promise<GameDto & { plan: ReschedulePlan; notificationsQueued: number }> {
    const reason = input.reason?.trim() || null;
    if (input.force && !reason) {
      throw new ValidationError("Say why you are overriding the clash.");
    }
    const { plan, record } = await this.db.transaction(async (tx) => {
      const before = await lockGame(tx, input.id);
      // Serialise moves that touch the same rink or teams, so two admins
      // cannot both pass the clash check and land in the same window.
      const keys = [
        `placement:team:${before.homeTeamId}`,
        `placement:team:${before.awayTeamId}`,
        ...(input.surfaceId ?? before.surfaceId ? [`placement:surface:${input.surfaceId ?? before.surfaceId}`] : [])
      ].sort();
      for (const k of keys) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${k}))`);

      const plan = await planMove(tx, before, input);
      if (plan.conflicts.length > 0 && !input.force) {
        throw new ConflictError(
          `This move clashes: ${plan.conflicts.map((c) => c.message).join(" ")} Pick another time or rink, or move it anyway with a reason.`
        );
      }
      const status = before.status;
      const record = before.moveTo({
        startTsUtc: new Date(plan.startTsUtc),
        tz: plan.tz,
        venueName: plan.venueName,
        surfaceLabel: plan.surfaceLabel,
        surfaceId: plan.surfaceId,
        byUserId: input.userId,
        reason,
        overriddenConflicts: plan.conflicts.map((c) => c.message)
      });
      await saveIfStatus(tx, before, status);
      return { plan, record };
    });

    const fresh = await this.games.findById(GameId.of(input.id));
    if (!fresh || fresh.scheduledStartTsUtc.toISOString() !== plan.startTsUtc) {
      throw new Error(`game ${input.id}: readback after reschedule does not match the plan`);
    }

    // Teams only hear about games they can already see.
    let notices: GameNoticeResult = { recipients: 0, queued: 0 };
    if (fresh.publishedAt) {
      const target = {
        id: fresh.id.value,
        leagueId: fresh.leagueId,
        seasonId: fresh.seasonId,
        homeTeamId: fresh.homeTeamId,
        awayTeamId: fresh.awayTeamId
      };
      const ctx = await gameNoticeContext(this.db, target);
      const venueClause = (v: string | null, s: string | null) =>
        v ? `, ${v}${s ? `, ${s}` : ""}` : "";
      notices = await queueGameNotice(this.db, this.notify, {
        game: target,
        templateCode: "game.rescheduled",
        eventKey: `game.rescheduled:${fresh.id.value}:${record.at}`,
        orgId: ctx.orgId,
        payload: {
          homeTeam: ctx.homeTeam,
          awayTeam: ctx.awayTeam,
          fromLabel: gameTimeLabel(new Date(record.from.startTsUtc), plan.tz),
          fromVenueClause: venueClause(record.from.venueName, record.from.surfaceLabel),
          toLabel: gameTimeLabel(new Date(record.to.startTsUtc), plan.tz),
          toVenueClause: venueClause(record.to.venueName, record.to.surfaceLabel),
          reasonClause: reason ? ` Reason: ${reason}` : ""
        }
      });
    }
    log.log(
      `reschedule game=${input.id} to=${plan.startTsUtc} surface=${plan.surfaceId ?? "none"} forced=${plan.conflicts.length > 0} queued=${notices.queued}`
    );
    return { ...GameDto.fromDomain(fresh), plan, notificationsQueued: notices.queued };
  }
}

@Injectable()
export class StartPlayHandler
  implements CommandHandler<{ id: string }, GameDto>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}
  async execute(input: { id: string }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.startPlay();
    await this.games.save(g);

    // Lock both teams' lineups the moment the game starts play
    // (Backlog #5 — captain edits 409 past this point). Idempotent —
    // only sets locked_at on rows where it's still null.
    await this.db
      .update(schema.gameLineups)
      .set({ lockedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.gameLineups.gameId, input.id),
          isNull(schema.gameLineups.lockedAt)
        )
      );

    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class ApplyScoreHandler
  implements
    CommandHandler<
      { id: string; home: number; away: number; period?: number },
      GameDto
    >
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: {
    id: string;
    home: number;
    away: number;
    period?: number;
  }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.applyScore(input.home, input.away, input.period);
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class PostponeGameHandler
  implements CommandHandler<{ id: string }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: { id: string }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.postpone();
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class CancelGameHandler
  implements CommandHandler<{ id: string }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: { id: string }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.cancel();
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

@Injectable()
export class ForfeitGameHandler
  implements
    CommandHandler<{ id: string; winningTeamId: string }, GameDto>
{
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}
  async execute(input: {
    id: string;
    winningTeamId: string;
  }): Promise<GameDto> {
    const g = await this.games.findById(GameId.of(input.id));
    if (!g) throw new NotFoundError("Game", input.id);
    g.forfeit(input.winningTeamId);
    await this.games.save(g);
    return GameDto.fromDomain(g);
  }
}

export interface FinalizeSummary {
  endedIn: GameEnding | null;
  statLinesWritten: number;
  standingsTeamsRanked: number;
  standingsGamesCounted: number;
  pointsRuleSource: "default" | "request";
  notificationRecipients: number;
  notificationsQueued: number;
}

/**
 * Finalize (UC-12) as one command (SCH-17): in one transaction, lock the
 * game, check the score against the goal events, mark it completed with
 * how it ended and who finalized it, rebuild the game's stat lines from
 * the event log and the league's standings from completed games. Any
 * failure rolls all of it back, so a game is never final without its
 * stats. After commit: read the game back and queue one notification
 * per player and captain of both teams.
 */
@Injectable()
export class FinalizeGameHandler
  implements
    CommandHandler<
      { id: string; userId: string; endedIn?: GameEnding | null },
      GameDto & { finalizeSummary: FinalizeSummary }
    >
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  async execute(input: {
    id: string;
    userId: string;
    endedIn?: GameEnding | null;
  }): Promise<GameDto & { finalizeSummary: FinalizeSummary }> {
    const done = await this.db.transaction(async (tx) => {
      const g = await lockGame(tx, input.id);
      if (g.status !== "in_play") {
        // Only in_play -> completed is allowed, so this throws the
        // domain's own message ("already final" / "not in play") before
        // any score check.
        g.finalize(input.userId);
      }

      const goals = await tx
        .select({
          teamId: schema.gameEvents.teamId,
          n: sql<number>`count(*)::int`.mapWith(Number)
        })
        .from(schema.gameEvents)
        .where(and(eq(schema.gameEvents.gameId, input.id), eq(schema.gameEvents.eventType, "goal")))
        .groupBy(schema.gameEvents.teamId);
      const goalEvents = { home: 0, away: 0, withoutTeam: 0 };
      for (const r of goals) {
        if (r.teamId === g.homeTeamId) goalEvents.home += r.n;
        else if (r.teamId === g.awayTeamId) goalEvents.away += r.n;
        else goalEvents.withoutTeam += r.n;
      }
      const verdict = checkFinalResult({
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        endedIn: input.endedIn ?? null,
        goalEvents
      });
      if (!verdict.ok) throw new DomainError(verdict.code, verdict.message);

      g.finalize(input.userId, verdict.endedIn);
      await saveIfStatus(tx, g, "in_play");
      const projection = await projectGameStats(tx, input.id);
      const standings = await recomputeLeagueStandings(tx, g.leagueId);
      return { endedIn: verdict.endedIn, projection, standings };
    });

    const fresh = await this.games.findById(GameId.of(input.id));
    if (!fresh || fresh.status !== "completed") {
      throw new Error(`game ${input.id}: readback after finalize is not completed`);
    }

    const target = {
      id: fresh.id.value,
      leagueId: fresh.leagueId,
      seasonId: fresh.seasonId,
      homeTeamId: fresh.homeTeamId,
      awayTeamId: fresh.awayTeamId
    };
    const ctx = await gameNoticeContext(this.db, target);
    const notices = await queueGameNotice(this.db, this.notify, {
      game: target,
      templateCode: "game.finalized",
      eventKey: `game.finalized:${fresh.id.value}:${fresh.finalizedAt?.toISOString() ?? ""}`,
      orgId: ctx.orgId,
      payload: {
        homeTeam: ctx.homeTeam,
        awayTeam: ctx.awayTeam,
        homeScore: fresh.homeScore,
        awayScore: fresh.awayScore,
        endedInClause:
          done.endedIn && done.endedIn !== "regulation"
            ? ` (${GAME_ENDING_LABELS[done.endedIn].toLowerCase()})`
            : ""
      }
    });

    const finalizeSummary: FinalizeSummary = {
      endedIn: done.endedIn,
      statLinesWritten: done.projection.linesWritten,
      standingsTeamsRanked: done.standings.teamsRanked,
      standingsGamesCounted: done.standings.gamesCounted,
      pointsRuleSource: done.standings.pointsRuleSource,
      notificationRecipients: notices.recipients,
      notificationsQueued: notices.queued
    };
    log.log(`finalize game=${input.id} by=${input.userId} ${JSON.stringify(finalizeSummary)}`);
    return { ...GameDto.fromDomain(fresh), finalizeSummary };
  }
}
