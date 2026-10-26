import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  ConflictError,
  DomainError,
  GAME_ENDING_LABELS,
  SCHEDULABLE_ENTRY_STATUSES,
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
  gameInsertValues,
  gameUpdateValues,
  rowToGame
} from "../../infrastructure/repositories/drizzle-game.repository";
import {
  projectGameStats,
  recomputeLeagueStandings,
  recordAttendanceFromLineups,
  type Tx
} from "../../../stats/application/projections";
import {
  gameNoticeContext,
  gameTimeLabel,
  queueGameNotice,
  type GameNoticeResult
} from "./game-notifications";
import { serveSuspensionsForFinalizedGame } from "../suspensions/suspension-rules";

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
  /** An official's games only (shared/auth/game-access officiatingFilter). */
  officiating?: {
    orgIds: string[];
    leagueIds: string[];
    seasonIds: string[];
    divisionIds: string[];
    gameIds: string[];
  };
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
  /** Optional cross-check: must be the division's season when given. */
  seasonId?: string | null;
  divisionId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Rink (surface). The game takes the rink's names and time zone. */
  surfaceId: string;
  /** Start as rink-local wall time "YYYY-MM-DDTHH:MM". */
  startLocal: string;
  durationMin?: number;
  /** Show on team schedules right away (SCH-7). Default false = draft. */
  publish?: boolean;
  /** Create even when the time clashes; needs a reason. */
  force?: boolean;
  reason?: string;
  userId: string;
}

interface NewGamePlacement {
  sportCode: string;
  seasonId: string;
  divisionId: string;
  rink: Rink;
  start: Date;
}

/**
 * Check a hand-made game against the stored rows (SCH-5): the division
 * belongs to the league (and to the season, when one is sent), both
 * teams play in that division, the rink belongs to the league's
 * organisation, and the rink-local start is a real time in the rink's
 * zone. Season, sport, time zone and rink names come from the database,
 * never from the client.
 */
async function resolveNewGame(exec: Exec, input: CreateGameInput): Promise<NewGamePlacement> {
  const [league] = await exec
    .select({
      orgId: schema.leagues.orgId,
      sportCode: schema.leagues.sportCode,
      status: schema.leagues.status,
      name: schema.leagues.name
    })
    .from(schema.leagues)
    .where(eq(schema.leagues.id, input.leagueId))
    .limit(1);
  if (!league) throw new NotFoundError("League", input.leagueId);
  if (league.status === "archived") {
    throw new DomainError("GAME_LEAGUE_ARCHIVED", `${league.name} is archived. Games cannot be added to it.`);
  }

  const [division] = await exec
    .select({
      id: schema.divisions.id,
      name: schema.divisions.name,
      status: schema.divisions.status,
      deletedAt: schema.divisions.deletedAt,
      seasonId: schema.divisions.seasonId,
      seasonName: schema.seasons.name,
      seasonStatus: schema.seasons.status,
      seasonDeletedAt: schema.seasons.deletedAt,
      seasonLeagueId: schema.seasons.leagueId
    })
    .from(schema.divisions)
    .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
    .where(eq(schema.divisions.id, input.divisionId))
    .limit(1);
  if (!division || division.deletedAt || division.seasonDeletedAt) {
    throw new NotFoundError("Division", input.divisionId);
  }
  if (division.seasonLeagueId !== input.leagueId) {
    throw new DomainError(
      "GAME_DIVISION_OTHER_LEAGUE",
      `${division.name} belongs to another league. Pick a division of ${league.name}.`
    );
  }
  if (input.seasonId && input.seasonId !== division.seasonId) {
    throw new DomainError(
      "GAME_DIVISION_OTHER_SEASON",
      `${division.name} is not in the season you picked. Pick the season again.`
    );
  }
  if (division.seasonStatus === "archived") {
    throw new DomainError("GAME_SEASON_ARCHIVED", `${division.seasonName} is archived. Games cannot be added to it.`);
  }
  if (division.status === "archived") {
    throw new DomainError("GAME_DIVISION_ARCHIVED", `${division.name} is archived. Games cannot be added to it.`);
  }

  const teamIds = [input.homeTeamId, input.awayTeamId];
  const [teams, entries] = await Promise.all([
    exec
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        status: schema.teams.status,
        deletedAt: schema.teams.deletedAt
      })
      .from(schema.teams)
      .where(inArray(schema.teams.id, teamIds)),
    exec
      .select({ teamId: schema.divisionTeamEntries.teamId })
      .from(schema.divisionTeamEntries)
      .where(
        and(
          eq(schema.divisionTeamEntries.divisionId, division.id),
          inArray(schema.divisionTeamEntries.teamId, teamIds),
          isNull(schema.divisionTeamEntries.leftAt),
          inArray(schema.divisionTeamEntries.entryStatus, [...SCHEDULABLE_ENTRY_STATUSES])
        )
      )
  ]);
  const entered = new Set(entries.map((e) => e.teamId));
  for (const id of teamIds) {
    const team = teams.find((t) => t.id === id);
    if (!team || team.deletedAt) throw new NotFoundError("Team", id);
    if (team.status === "dissolved") {
      throw new DomainError("GAME_TEAM_DISSOLVED", `${team.name} is dissolved and cannot play.`);
    }
    if (!entered.has(id)) {
      throw new DomainError(
        "GAME_TEAM_NOT_IN_DIVISION",
        `${team.name} is not entered in ${division.name}. Add the team on the division page first, or pick another team.`
      );
    }
  }

  const rink = await loadRinkForOrg(exec, input.surfaceId, league.orgId);
  if (!isValidTimeZone(rink.timezone)) {
    throw new DomainError(
      "GAME_RINK_TIME_ZONE",
      `${rink.venueName} has the time zone "${rink.timezone}", which is not a real time zone. Fix it under Rinks & ice time first.`
    );
  }
  let start: Date;
  try {
    start = zonedWallTimeToUtc(input.startLocal, rink.timezone);
  } catch (err) {
    throw new ValidationError((err as Error).message);
  }
  return { sportCode: league.sportCode, seasonId: division.seasonId, divisionId: division.id, rink, start };
}

/**
 * Create a hand-made game (UC-07 fallback, SCH-5) as one command: in one
 * transaction, check it against the stored season, division, entries and
 * rink, take the same placement locks as a move, refuse a clash (rink
 * double-booked or a team playing twice at once) unless forced with a
 * reason, and insert. After commit: read it back and, when published,
 * queue a notice per player and captain of both teams.
 */
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
    if (input.homeTeamId === input.awayTeamId) {
      throw new DomainError("GAME_SELF_PLAY", "Pick two different teams. A team cannot play itself.");
    }
    const reason = input.reason?.trim() || null;
    if (input.force && !reason) {
      throw new ValidationError("Say why you are scheduling over the clash.");
    }
    const durationMin = input.durationMin ?? 60;

    const created = await this.db.transaction(async (tx) => {
      // Lock first, then read: a rink archived or a game placed by a
      // concurrent request is seen here, not after the insert.
      await lockPlacement(tx, {
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        surfaceId: input.surfaceId
      });
      const placed = await resolveNewGame(tx, input);
      const conflicts = await placementConflicts(tx, {
        excludeGameId: null,
        start: placed.start,
        durationMin,
        surfaceId: placed.rink.surfaceId,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        tz: placed.rink.timezone,
        venueName: placed.rink.venueName,
        surfaceLabel: placed.rink.surfaceLabel
      });
      if (conflicts.length > 0 && !input.force) {
        throw new ConflictError(
          `This game clashes: ${conflicts.map((c) => c.message).join(" ")} Pick another time or rink, or schedule it anyway with a reason.`
        );
      }
      const g = Game.create({
        id: GameId.of(randomUUID()),
        leagueId: input.leagueId,
        seasonId: placed.seasonId,
        divisionId: placed.divisionId,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        sportCode: placed.sportCode,
        scheduledStartTsUtc: placed.start,
        tz: placed.rink.timezone,
        durationMin,
        venueName: placed.rink.venueName,
        surfaceLabel: placed.rink.surfaceLabel,
        surfaceId: placed.rink.surfaceId,
        metadata: {
          createdByUserId: input.userId,
          ...(conflicts.length > 0
            ? { createdOverConflicts: { reason, conflicts: conflicts.map((c) => c.message) } }
            : {})
        }
      });
      if (input.publish) g.publish();
      const rows = await tx
        .insert(schema.games)
        .values(gameInsertValues(g.toSnapshot()))
        .returning({ id: schema.games.id });
      if (rows.length !== 1) throw new Error(`game insert wrote ${rows.length} rows`);
      return { id: g.id.value, start: placed.start, forcedOver: conflicts.length };
    });

    const saved = await this.games.findById(GameId.of(created.id));
    if (
      !saved ||
      saved.scheduledStartTsUtc.getTime() !== created.start.getTime() ||
      saved.divisionId !== input.divisionId ||
      saved.surfaceId !== input.surfaceId ||
      !saved.seasonId
    ) {
      throw new Error(`game ${created.id}: readback after create does not match what was written`);
    }
    const notices = saved.publishedAt
      ? await notifyScheduled(this.db, this.notify, saved)
      : { recipients: 0, queued: 0 };
    log.log(
      `create game=${created.id} by=${input.userId} division=${input.divisionId} surface=${input.surfaceId} start=${created.start.toISOString()} published=${!!saved.publishedAt} forcedOver=${created.forcedOver} queued=${notices.queued}`
    );
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
    const [league] = await exec
      .select({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, g.leagueId))
      .limit(1);
    if (!league) throw new NotFoundError("League", g.leagueId);
    const rink = await loadRinkForOrg(exec, input.surfaceId, league.orgId);
    tz = rink.timezone;
    venueName = rink.venueName;
    surfaceLabel = rink.surfaceLabel;
    surfaceId = rink.surfaceId;
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

  const conflicts = await placementConflicts(exec, {
    excludeGameId: g.id.value,
    start,
    durationMin: g.durationMin,
    surfaceId,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    tz,
    venueName,
    surfaceLabel
  });

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

interface Rink {
  surfaceId: string;
  surfaceLabel: string;
  venueName: string;
  timezone: string;
}

/** A live rink (surface of a live venue) of `orgId`, or a plain refusal. */
async function loadRinkForOrg(exec: Exec, surfaceId: string, orgId: string): Promise<Rink> {
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
        eq(schema.surfaces.id, surfaceId),
        isNull(schema.surfaces.deletedAt),
        isNull(schema.venues.deletedAt)
      )
    )
    .limit(1);
  if (!surface) throw new NotFoundError("Rink", surfaceId);
  if (surface.venueOrgId !== orgId) {
    throw new DomainError(
      "GAME_RINK_OTHER_ORG",
      "That rink belongs to another organisation. Pick one of this league's rinks."
    );
  }
  return {
    surfaceId: surface.id,
    surfaceLabel: surface.label,
    venueName: surface.venueName,
    timezone: surface.timezone
  };
}

/**
 * Serialise placements (create, move) that touch the same rink or teams,
 * so two admins cannot both pass the clash check and land in the same
 * window.
 */
async function lockPlacement(
  tx: Tx,
  p: { homeTeamId: string; awayTeamId: string; surfaceId: string | null }
): Promise<void> {
  const keys = [
    `placement:team:${p.homeTeamId}`,
    `placement:team:${p.awayTeamId}`,
    ...(p.surfaceId ? [`placement:surface:${p.surfaceId}`] : [])
  ].sort();
  for (const k of keys) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${k}))`);
}

interface PlacementTarget {
  /** The game being moved; null for a new game. */
  excludeGameId: string | null;
  start: Date;
  durationMin: number;
  surfaceId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  /** For the messages: the rink's zone and names. */
  tz: string;
  venueName: string | null;
  surfaceLabel: string | null;
}

/**
 * What a placement would clash with: another live game on the same rink
 * in an overlapping window, or either team already playing in an
 * overlapping window. Same two hard constraints the scheduler enforces
 * (no_venue_double_book, no_team_overlap), checked across every league
 * so a team is never in two places at once.
 */
async function placementConflicts(exec: Exec, t: PlacementTarget): Promise<RescheduleConflict[]> {
  const end = new Date(t.start.getTime() + t.durationMin * 60_000);
  const overlaps = sql`${schema.games.scheduledStartTsUtc} < ${end.toISOString()}::timestamptz
    and ${schema.games.scheduledStartTsUtc} + make_interval(mins => ${schema.games.durationMin}::int) > ${t.start.toISOString()}::timestamptz`;
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
        ...(t.excludeGameId ? [ne(schema.games.id, t.excludeGameId)] : []),
        live,
        overlaps,
        or(
          ...(t.surfaceId ? [eq(schema.games.surfaceId, t.surfaceId)] : []),
          inArray(schema.games.homeTeamId, [t.homeTeamId, t.awayTeamId]),
          inArray(schema.games.awayTeamId, [t.homeTeamId, t.awayTeamId])
        )
      )
    );

  const names = await resolveEntityNames(
    exec as Database,
    clashes.flatMap((c) => [
      { type: "team", id: c.homeTeamId },
      { type: "team", id: c.awayTeamId }
    ]).concat([
      { type: "team", id: t.homeTeamId },
      { type: "team", id: t.awayTeamId }
    ])
  );
  const team = (id: string) => names.get(`team:${id}`) ?? "another team";
  const conflicts: RescheduleConflict[] = [];
  for (const c of clashes) {
    const when = gameTimeLabel(c.start, t.tz);
    const matchup = `${team(c.awayTeamId)} at ${team(c.homeTeamId)}`;
    if (t.surfaceId && c.surfaceId === t.surfaceId) {
      conflicts.push({
        kind: "rink",
        gameId: c.id,
        message: `${t.venueName ?? "This rink"}${t.surfaceLabel ? `, ${t.surfaceLabel}` : ""} is already booked for ${matchup} at ${when}.`
      });
    }
    for (const id of [t.homeTeamId, t.awayTeamId]) {
      if (c.homeTeamId === id || c.awayTeamId === id) {
        conflicts.push({
          kind: "team",
          gameId: c.id,
          message: `${team(id)} already have a game then: ${matchup} at ${when}.`
        });
      }
    }
  }
  return conflicts;
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
      await lockPlacement(tx, {
        homeTeamId: before.homeTeamId,
        awayTeamId: before.awayTeamId,
        surfaceId: input.surfaceId ?? before.surfaceId
      });

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

/**
 * Postpone or cancel a game, then tell both teams (UC-21, MON-14). One
 * locked write (a second click finds the new status and is refused, so
 * nobody hears twice); a notice only for a published game, because
 * teams only hear about games they can already see.
 */
async function stopGame(
  db: Database,
  games: GameRepository,
  notify: NotificationService,
  id: string,
  to: "postponed" | "cancelled"
): Promise<GameDto & { notificationsQueued: number }> {
  await db.transaction(async (tx) => {
    const g = await lockGame(tx, id);
    const status = g.status;
    if (to === "postponed") g.postpone();
    else g.cancel();
    await saveIfStatus(tx, g, status);
  });
  const fresh = await games.findById(GameId.of(id));
  if (!fresh || fresh.status !== to) {
    throw new Error(`game ${id}: readback after ${to} shows ${fresh?.status ?? "no row"}`);
  }
  let notices: GameNoticeResult = { recipients: 0, queued: 0 };
  if (fresh.publishedAt) {
    const target = {
      id: fresh.id.value,
      leagueId: fresh.leagueId,
      seasonId: fresh.seasonId,
      homeTeamId: fresh.homeTeamId,
      awayTeamId: fresh.awayTeamId
    };
    const ctx = await gameNoticeContext(db, target);
    notices = await queueGameNotice(db, notify, {
      game: target,
      templateCode: to === "postponed" ? "game.postponed" : "game.cancelled",
      eventKey: `game.${to}:${id}:${fresh.updatedAt.toISOString()}`,
      orgId: ctx.orgId,
      payload: {
        homeTeam: ctx.homeTeam,
        awayTeam: ctx.awayTeam,
        whenLabel: gameTimeLabel(fresh.scheduledStartTsUtc, fresh.tz),
        venueClause: fresh.venueName
          ? ` at ${fresh.venueName}${fresh.surfaceLabel ? `, ${fresh.surfaceLabel}` : ""}`
          : ""
      }
    });
  }
  log.log(`${to} game=${id} published=${!!fresh.publishedAt} recipients=${notices.recipients} queued=${notices.queued}`);
  return { ...GameDto.fromDomain(fresh), notificationsQueued: notices.queued };
}

@Injectable()
export class PostponeGameHandler
  implements CommandHandler<{ id: string }, GameDto & { notificationsQueued: number }>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}
  execute(input: { id: string }): Promise<GameDto & { notificationsQueued: number }> {
    return stopGame(this.db, this.games, this.notify, input.id, "postponed");
  }
}

@Injectable()
export class CancelGameHandler
  implements CommandHandler<{ id: string }, GameDto & { notificationsQueued: number }>
{
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}
  execute(input: { id: string }): Promise<GameDto & { notificationsQueued: number }> {
    return stopGame(this.db, this.games, this.notify, input.id, "cancelled");
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
  pointsRuleSource: "default" | "request" | "division" | "season";
  notificationRecipients: number;
  notificationsQueued: number;
  /** Game-count suspensions of players on either team that counted this game (COMP-10). */
  suspensionsServed: number;
  /** Of those, how many are now fully served. */
  suspensionsCompleted: number;
}

/**
 * Finalize (UC-12) as one command (SCH-17): in one transaction, lock the
 * game, check the score against the goal events, mark it completed with
 * how it ended and who finalized it, rebuild the game's stat lines from
 * the event log and the league's standings from completed games, and
 * count the game served for suspended players of both teams (COMP-10).
 * Any failure rolls all of it back, so a game is never final without
 * its stats or its suspension count. Finalize happens once per game
 * (in_play -> completed is terminal), which keeps that count
 * idempotent. After commit: read the game back and queue one
 * notification per player and captain of both teams.
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
      // Who dressed (from the locked lineups) before stats, so games
      // played count everyone who played (FR-3.5.4).
      await recordAttendanceFromLineups(tx, input.id);
      const projection = await projectGameStats(tx, input.id);
      const standings = await recomputeLeagueStandings(tx, g.leagueId);
      const suspensions = await serveSuspensionsForFinalizedGame(tx, {
        id: input.id,
        start: g.scheduledStartTsUtc,
        seasonId: g.seasonId,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId
      });
      return { endedIn: verdict.endedIn, projection, standings, suspensions };
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
      notificationsQueued: notices.queued,
      suspensionsServed: done.suspensions.served.length,
      suspensionsCompleted: done.suspensions.served.filter((x) => x.status === "served").length
    };
    log.log(`finalize game=${input.id} by=${input.userId} ${JSON.stringify(finalizeSummary)}`);
    return { ...GameDto.fromDomain(fresh), finalizeSummary };
  }
}
