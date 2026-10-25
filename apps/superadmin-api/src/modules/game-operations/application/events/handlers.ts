import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  clampLimit,
  DomainError,
  HOCKEY_SPORT_CODE,
  NotFoundError,
  ValidationError,
  validateHockeyEvent,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import {
  GAME_EVENT_REPOSITORY,
  type GameEventRepository
} from "../../domain/repositories/game-event.repository";
import {
  GAME_REPOSITORY,
  type GameRepository
} from "../../domain/repositories/game.repository";
import { GameEventId, GameId } from "../../domain/identifiers";
import {
  GameEvent,
  type EventSource
} from "../../domain/entities/game-event.entity";
import { GameEventDto, GameEventPageDto } from "../dtos/game.dto";

export interface AppendEventInput {
  gameId: string;
  eventType: string;
  tsUtc?: string;
  period?: number | null;
  clockRemainingSec?: number | null;
  teamId?: string | null;
  primaryPersonId?: string | null;
  secondaryPersonIds?: string[];
  attributes?: Record<string, unknown>;
  source?: EventSource;
  sourceDeviceId?: string | null;
  idempotencyKey?: string | null;
  correctionOfEventId?: string | null;
  loggedByUserId?: string | null;
}

/**
 * Append one scoresheet event. The server checks what the dialog offers:
 * the game is in play, the team is one of the two playing, hockey events
 * have the right shape (assists on the goal, penalty infraction and
 * minutes; kernel validateHockeyEvent), and every named player is on
 * that team's active roster for the game's season or checked in to this
 * game for that team (guests). Nothing unrostered reaches the stat lines.
 */
@Injectable()
export class AppendEventHandler
  implements CommandHandler<AppendEventInput, GameEventDto>
{
  private readonly log = new Logger(AppendEventHandler.name);
  constructor(
    @Inject(GAME_EVENT_REPOSITORY) private readonly events: GameEventRepository,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}
  async execute(input: AppendEventInput): Promise<GameEventDto> {
    if (input.idempotencyKey) {
      const existing = await this.events.findByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return GameEventDto.fromDomain(existing);
    }
    const game = await this.games.findById(GameId.of(input.gameId));
    if (!game) throw new NotFoundError("Game", input.gameId);
    if (game.status !== "in_play") {
      throw new DomainError(
        "GAME_NOT_IN_PLAY",
        "Events can only be logged while the game is in play."
      );
    }
    if (input.teamId && input.teamId !== game.homeTeamId && input.teamId !== game.awayTeamId) {
      throw new ValidationError("That team is not playing in this game.");
    }
    if (game.sportCode === HOCKEY_SPORT_CODE) {
      const problem = validateHockeyEvent({
        eventType: input.eventType,
        teamId: input.teamId,
        primaryPersonId: input.primaryPersonId,
        secondaryPersonIds: input.secondaryPersonIds,
        attributes: input.attributes
      });
      if (problem) throw new ValidationError(problem);
    }
    const named = [
      ...(input.primaryPersonId ? [input.primaryPersonId] : []),
      ...(input.secondaryPersonIds ?? [])
    ];
    if (named.length > 0) {
      if (!input.teamId) throw new ValidationError("Pick the player's team.");
      await this.assertOnRoster(game.id.value, input.teamId, game.seasonId, game.divisionId, named);
    }

    const event = GameEvent.create({
      id: GameEventId.of(randomUUID()),
      gameId: input.gameId,
      sportCode: game.sportCode,
      eventType: input.eventType,
      tsUtc: input.tsUtc ? new Date(input.tsUtc) : undefined,
      period: input.period,
      clockRemainingSec: input.clockRemainingSec,
      teamId: input.teamId,
      primaryPersonId: input.primaryPersonId,
      secondaryPersonIds: input.secondaryPersonIds,
      attributes: input.attributes,
      source: input.source,
      sourceDeviceId: input.sourceDeviceId,
      idempotencyKey: input.idempotencyKey,
      correctionOfEventId: input.correctionOfEventId,
      loggedByUserId: input.loggedByUserId
    });
    await this.events.insert(event);
    if (input.eventType === "goal") await this.raiseScoreToGoalTally(input.gameId);
    return GameEventDto.fromDomain(event);
  }

  /**
   * SCH-16: logging a goal moves the score. Each side's score rises to at
   * least its count of goal events (the same count finalize checks), and
   * is never lowered here, so a manual correction or a shootout goal the
   * scorekeeper entered is kept.
   */
  private async raiseScoreToGoalTally(gameId: string): Promise<void> {
    const rows = await this.db.execute(sql`
      UPDATE games g SET
        home_score = GREATEST(g.home_score, t.home_goals),
        away_score = GREATEST(g.away_score, t.away_goals),
        updated_at = now()
      FROM (
        SELECT
          count(*) FILTER (WHERE e.team_id = g2.home_team_id)::int AS home_goals,
          count(*) FILTER (WHERE e.team_id = g2.away_team_id)::int AS away_goals
        FROM games g2
        LEFT JOIN game_events e ON e.game_id = g2.id AND e.event_type = 'goal'
        WHERE g2.id = ${gameId}::uuid
      ) t
      WHERE g.id = ${gameId}::uuid AND g.status = 'in_play'
        AND (g.home_score < t.home_goals OR g.away_score < t.away_goals)
      RETURNING g.home_score, g.away_score
    `);
    const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{ home_score: number; away_score: number }>;
    if (list[0]) this.log.log(`game.score_from_goals game=${gameId} score=${list[0].home_score}-${list[0].away_score}`);
  }

  private async assertOnRoster(
    gameId: string,
    teamId: string,
    gameSeasonId: string | null,
    divisionId: string | null,
    personIds: string[]
  ): Promise<void> {
    let seasonId = gameSeasonId;
    if (!seasonId && divisionId) {
      const [d] = await this.db
        .select({ seasonId: schema.divisions.seasonId })
        .from(schema.divisions)
        .where(eq(schema.divisions.id, divisionId))
        .limit(1);
      seasonId = d?.seasonId ?? null;
    }
    const ids = [...new Set(personIds)];
    const [members, guests] = await Promise.all([
      this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, teamId),
            eq(schema.teamMemberships.currentStatus, "active"),
            inArray(schema.teamMemberships.personId, ids),
            ...(seasonId ? [eq(schema.teamMemberships.seasonId, seasonId)] : [])
          )
        ),
      this.db
        .selectDistinct({ personId: schema.gameAttendance.personId })
        .from(schema.gameAttendance)
        .where(
          and(
            eq(schema.gameAttendance.gameId, gameId),
            eq(schema.gameAttendance.teamId, teamId),
            inArray(schema.gameAttendance.personId, ids)
          )
        )
    ]);
    const ok = new Set([...members, ...guests].map((r) => r.personId));
    const missing = ids.filter((id) => !ok.has(id));
    if (missing.length > 0) {
      throw new ValidationError(
        missing.length === 1
          ? "A player you picked is not on this team's roster for the game's season."
          : `${missing.length} players you picked are not on this team's roster for the game's season.`
      );
    }
  }
}

export interface ListEventsInput {
  limit?: number;
  cursor?: string;
  gameId?: string;
  eventType?: string;
  primaryPersonId?: string;
  /** Scoped callers: only events of games in these leagues. */
  leagueIdsFilter?: string[];
}

@Injectable()
export class ListEventsHandler
  implements QueryHandler<ListEventsInput, GameEventPageDto>
{
  constructor(
    @Inject(GAME_EVENT_REPOSITORY) private readonly events: GameEventRepository
  ) {}
  async execute(input: ListEventsInput): Promise<GameEventPageDto> {
    const page = await this.events.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(GameEventDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class ListGameEventsHandler
  implements QueryHandler<{ gameId: string }, GameEventDto[]>
{
  constructor(
    @Inject(GAME_EVENT_REPOSITORY) private readonly events: GameEventRepository
  ) {}
  async execute(input: { gameId: string }): Promise<GameEventDto[]> {
    const items = await this.events.listForGame(input.gameId);
    return items.map(GameEventDto.fromDomain);
  }
}
