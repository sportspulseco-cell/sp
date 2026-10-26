import { Logger } from "@nestjs/common";
import { and, asc, eq, gt, isNotNull, lte, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { NotificationService } from "../../../communications/application/notification.service";
import { gameNoticeContext, gameTimeLabel, queueGameNotice } from "./game-notifications";

/**
 * Game reminders (FR-3.17.3 "Auto-reminders for payments and games").
 *
 * An hourly sweep reminds both teams' rostered players, captains and
 * coaches about a published, still-scheduled game that starts within the
 * next day. Same fan-out and channel rule as every other game notice
 * (queueGameNotice): one row per person, email when they have an address,
 * and the person's preferences for `game.reminder` apply.
 *
 * Idempotent per (game, start time, person): the key carries the start
 * time, so a game moved to a new time gets a new reminder and an
 * unchanged game is never reminded twice. Games that already have any
 * reminder row for their current start time are skipped up front, which
 * keeps an hourly run cheap. The run stops taking new games after a time
 * budget (a game is never left half done) and reports `more` so the next
 * run picks up the rest.
 */

const log = new Logger("GameReminders");

/** Remind games starting between LEAD_MIN_MINUTES and LEAD_HOURS from now. */
export const REMINDER_LEAD_HOURS = 24;
const LEAD_MIN_MINUTES = 30;
const MAX_GAMES_PER_RUN = 60;
const TIME_BUDGET_MS = 18_000;

export interface ReminderSweepResult {
  candidates: number;
  games: number;
  recipients: number;
  queued: number;
  more: boolean;
}

export function reminderEventKey(gameId: string, start: Date): string {
  return `game.reminder:${gameId}:${start.toISOString()}`;
}

export async function sweepGameReminders(
  db: Database,
  notify: NotificationService,
  now: Date = new Date()
): Promise<ReminderSweepResult> {
  const from = new Date(now.getTime() + LEAD_MIN_MINUTES * 60_000);
  const to = new Date(now.getTime() + REMINDER_LEAD_HOURS * 3_600_000);
  const g = schema.games;
  const due = await db
    .select({
      id: g.id,
      leagueId: g.leagueId,
      seasonId: g.seasonId,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      start: g.scheduledStartTsUtc,
      tz: g.tz,
      venueName: g.venueName,
      surfaceLabel: g.surfaceLabel
    })
    .from(g)
    .where(
      and(
        eq(g.status, "scheduled"),
        isNotNull(g.publishedAt),
        gt(g.scheduledStartTsUtc, from),
        lte(g.scheduledStartTsUtc, to),
        // Not reminded yet for this start time.
        sql`NOT EXISTS (
          SELECT 1 FROM ${schema.notifications} n
           WHERE n.idempotency_key LIKE 'game.reminder:' || ${g.id}::text || ':'
                 || to_char(${g.scheduledStartTsUtc} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ':%'
        )`
      )
    )
    .orderBy(asc(g.scheduledStartTsUtc))
    .limit(MAX_GAMES_PER_RUN + 1);

  const started = Date.now();
  let games = 0;
  let recipients = 0;
  let queued = 0;
  let more = due.length > MAX_GAMES_PER_RUN;
  for (const game of due.slice(0, MAX_GAMES_PER_RUN)) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      more = true;
      break;
    }
    const target = {
      id: game.id,
      leagueId: game.leagueId,
      seasonId: game.seasonId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId
    };
    try {
      const ctx = await gameNoticeContext(db, target);
      const r = await queueGameNotice(db, notify, {
        game: target,
        templateCode: "game.reminder",
        eventKey: reminderEventKey(game.id, game.start),
        orgId: ctx.orgId,
        payload: {
          homeTeam: ctx.homeTeam,
          awayTeam: ctx.awayTeam,
          whenLabel: gameTimeLabel(game.start, game.tz),
          venueClause: game.venueName
            ? ` at ${game.venueName}${game.surfaceLabel ? `, ${game.surfaceLabel}` : ""}`
            : ""
        }
      });
      games++;
      recipients += r.recipients;
      queued += r.queued;
    } catch (err) {
      // One bad game must not stop the rest; it stays due and is retried next run.
      log.error(`reminder game=${game.id} failed: ${(err as Error).message}`);
    }
  }
  log.log(
    `sweep window=${from.toISOString()}..${to.toISOString()} candidates=${due.length} games=${games} recipients=${recipients} queued=${queued} more=${more}`
  );
  return { candidates: due.length, games, recipients, queued, more };
}
