import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { NotificationService } from "../../../communications/application/notification.service";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../../shared/display/entity-names";
import { gameTimeLabel, queueScheduleNotices, type ScheduleNoticeTeam } from "./game-notifications";

/**
 * Publish a generated schedule (UC-08, SCH-8). One command on the API,
 * the authority for games:
 *
 *  1. one UPDATE flips published_at from NULL to now for the scope's
 *     games (idempotent: a second click finds nothing left to publish);
 *  2. readback: the rows now carrying that published_at match the count;
 *  3. each team's rostered players, captains and coaches get one
 *     "schedule is out" notice (email when they have an address);
 *  4. connected screens refresh (Realtime broadcast) and the rinks are
 *     told (rink-notify-dispatch), as the scheduler-publish Edge Function
 *     did. Neither of these can undo the publish; failures are logged.
 *
 * Cancelled games stay unpublished.
 */

export interface PublishScheduleInput {
  seasonId: string;
  divisionId?: string;
  scheduleRunId?: string;
  userId: string;
  /** The caller's bearer header, forwarded to rink-notify-dispatch. */
  authorization?: string;
}

export interface PublishScheduleResult {
  seasonId: string;
  divisionId: string | null;
  scheduleRunId: string | null;
  publishedAt: string;
  gamesPublished: number;
  teamsNotified: number;
  recipients: number;
  notificationsQueued: number;
}

interface PublishedRow extends Record<string, unknown> {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_start_ts_utc: Date | string;
  tz: string;
  venue_name: string | null;
  surface_label: string | null;
}

const log = new Logger("PublishSchedule");

@Injectable()
export class PublishScheduleHandler {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly config: ConfigService
  ) {}

  async execute(input: PublishScheduleInput): Promise<PublishScheduleResult> {
    const [season] = await this.db
      .select({ id: schema.seasons.id, name: schema.seasons.name, orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, input.seasonId))
      .limit(1);
    if (!season) throw new Error(`season ${input.seasonId} not found`);

    const publishedAt = new Date();
    const result = await this.db.execute<PublishedRow>(sql`
      update games set published_at = ${publishedAt.toISOString()}::timestamptz
       where season_id = ${input.seasonId}
         and published_at is null
         and status <> 'cancelled'
         ${input.divisionId ? sql`and division_id = ${input.divisionId}` : sql``}
         ${input.scheduleRunId ? sql`and schedule_run_id = ${input.scheduleRunId}` : sql``}
      returning id, home_team_id, away_team_id, scheduled_start_ts_utc, tz, venue_name, surface_label`);
    const rows = rowsOf<PublishedRow>(result);

    // Readback: what the database now says was published at this instant.
    const [check] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.games)
      .where(and(eq(schema.games.seasonId, input.seasonId), eq(schema.games.publishedAt, publishedAt)));
    if ((check?.n ?? 0) !== rows.length) {
      log.error(
        `season=${input.seasonId}: update returned ${rows.length} games but readback finds ${check?.n ?? 0} with published_at=${publishedAt.toISOString()}`
      );
    }

    let notices = { teams: 0, recipients: 0, queued: 0 };
    if (rows.length > 0) {
      const teams = await this.teamsOf(rows);
      notices = await queueScheduleNotices(this.db, this.notify, {
        seasonId: season.id,
        seasonName: season.name,
        orgId: season.orgId,
        eventKey: `schedule.published:${season.id}:${publishedAt.toISOString()}`,
        teams
      });
      await Promise.all([
        this.broadcast(season.id, {
          seasonId: season.id,
          divisionId: input.divisionId ?? null,
          scheduleRunId: input.scheduleRunId ?? null,
          publishedAt: publishedAt.toISOString(),
          gamesPublished: rows.length
        }),
        this.tellRinks(rows.map((r) => r.id), input.authorization)
      ]);
    }

    log.log(
      `publish-schedule season=${input.seasonId} division=${input.divisionId ?? "all"} run=${input.scheduleRunId ?? "any"} by=${input.userId} games=${rows.length} teams=${notices.teams} recipients=${notices.recipients} queued=${notices.queued}`
    );
    return {
      seasonId: season.id,
      divisionId: input.divisionId ?? null,
      scheduleRunId: input.scheduleRunId ?? null,
      publishedAt: publishedAt.toISOString(),
      gamesPublished: rows.length,
      teamsNotified: notices.teams,
      recipients: notices.recipients,
      notificationsQueued: notices.queued
    };
  }

  /** Per team: how many games, and the first one (date, opponent, rink). */
  private async teamsOf(rows: PublishedRow[]): Promise<ScheduleNoticeTeam[]> {
    const byTeam = new Map<string, Array<{ row: PublishedRow; opponent: string; at: Date }>>();
    for (const row of rows) {
      const at = new Date(row.scheduled_start_ts_utc);
      for (const [team, opponent] of [
        [row.home_team_id, row.away_team_id],
        [row.away_team_id, row.home_team_id]
      ] as const) {
        const list = byTeam.get(team) ?? [];
        list.push({ row, opponent, at });
        byTeam.set(team, list);
      }
    }
    const names = await resolveEntityNames(
      this.db,
      [...byTeam.keys()].map((id) => ({ type: "team" as const, id }))
    );
    const nameOf = (id: string) => names.get(`team:${id}`) ?? "their opponent";
    return [...byTeam.entries()].map(([teamId, games]) => {
      games.sort((a, b) => a.at.getTime() - b.at.getTime());
      const first = games[0]!;
      return {
        teamId,
        teamName: names.get(`team:${teamId}`) ?? "Your team",
        gameCount: games.length,
        firstGameLabel: gameTimeLabel(first.at, first.row.tz),
        firstOpponent: nameOf(first.opponent),
        firstVenueClause: first.row.venue_name
          ? ` at ${first.row.venue_name}${first.row.surface_label ? `, ${first.row.surface_label}` : ""}`
          : ""
      };
    });
  }

  /** Same Realtime topic and event the Edge Function used. */
  private async broadcast(seasonId: string, payload: Record<string, unknown>): Promise<void> {
    const url = this.config.get<string>("SUPABASE_URL");
    const key = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      log.warn("realtime broadcast skipped: SUPABASE_URL or service key not set");
      return;
    }
    try {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ topic: `schedule:season:${seasonId}`, event: "schedule_published", payload }]
        })
      });
      if (!res.ok) log.warn(`realtime broadcast season=${seasonId}: HTTP ${res.status}`);
    } catch (err) {
      log.warn(`realtime broadcast season=${seasonId} failed: ${(err as Error).message}`);
    }
  }

  /** Rink webhooks / outbox, through the existing Edge Function. */
  private async tellRinks(gameIds: string[], authorization?: string): Promise<void> {
    const url = this.config.get<string>("SUPABASE_URL");
    if (!url || !authorization) {
      log.warn("rink dispatch skipped: no SUPABASE_URL or caller token");
      return;
    }
    try {
      const res = await fetch(`${url}/functions/v1/rink-notify-dispatch`, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ gameIds, eventType: "game_scheduled" })
      });
      const text = await res.text();
      if (!res.ok) log.warn(`rink dispatch games=${gameIds.length}: HTTP ${res.status} ${text.slice(0, 200)}`);
      else log.log(`rink dispatch games=${gameIds.length}: ${text.slice(0, 200)}`);
    } catch (err) {
      log.warn(`rink dispatch games=${gameIds.length} failed: ${(err as Error).message}`);
    }
  }
}

/** drizzle `execute` returns an array (postgres-js) or `{ rows }`. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}
