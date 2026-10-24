import { Logger } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { NotificationService } from "../../../communications/application/notification.service";
import type { TemplateCode } from "../../../communications/domain/templates/catalog";
import { resolveEntityNames } from "../../../../shared/display/entity-names";

/**
 * Fan a game notice out to the people on both teams: active rostered
 * players (for the game's season when it has one) plus the teams'
 * captains and coaches. One notification row per person through the
 * shared NotificationService: email when the person's account has an
 * address, in-app otherwise. The inbox (/notifications/me) lists every
 * row addressed to the person, so one row each avoids duplicates.
 *
 * Idempotent per (event key, person): a replayed click re-uses the rows.
 * Delivery itself is the NotificationService's job; on an environment
 * without RESEND_API_KEY email rows end "failed" with the reason, which
 * admins can see and retry from Communications.
 */

const log = new Logger("GameNotifications");

export interface GameNoticeTarget {
  id: string;
  leagueId: string;
  seasonId: string | null;
  homeTeamId: string;
  awayTeamId: string;
}

export interface GameNoticeResult {
  recipients: number;
  queued: number;
}

async function recipientsFor(
  db: Database,
  game: GameNoticeTarget
): Promise<Array<{ personId: string; email: string | null }>> {
  const teamIds = [game.homeTeamId, game.awayTeamId];
  const personIds = new Set<string>();

  const memberships = await db
    .selectDistinct({ personId: schema.teamMemberships.personId })
    .from(schema.teamMemberships)
    .where(
      and(
        inArray(schema.teamMemberships.teamId, teamIds),
        eq(schema.teamMemberships.currentStatus, "active"),
        ...(game.seasonId ? [eq(schema.teamMemberships.seasonId, game.seasonId)] : [])
      )
    );
  for (const m of memberships) personIds.add(m.personId);

  const staff = await db
    .selectDistinct({ personId: schema.persons.id })
    .from(schema.userRoleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .innerJoin(schema.persons, eq(schema.persons.userId, schema.userRoleAssignments.userId))
    .where(
      and(
        eq(schema.userRoleAssignments.scopeType, "team"),
        inArray(schema.userRoleAssignments.scopeId, teamIds),
        inArray(schema.roles.code, ["captain", "coach"]),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    );
  for (const s of staff) personIds.add(s.personId);

  if (personIds.size === 0) return [];
  const rows = await db
    .select({ id: schema.persons.id, email: schema.profiles.email })
    .from(schema.persons)
    .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
    .where(and(inArray(schema.persons.id, [...personIds]), isNull(schema.persons.deletedAt)));
  return rows.map((r) => ({ personId: r.id, email: r.email ?? null }));
}

/** Team names and the league's org for a notice payload. */
export async function gameNoticeContext(
  db: Database,
  game: GameNoticeTarget
): Promise<{ homeTeam: string; awayTeam: string; orgId: string | null }> {
  const [names, league] = await Promise.all([
    resolveEntityNames(db, [
      { type: "team", id: game.homeTeamId },
      { type: "team", id: game.awayTeamId }
    ]),
    db
      .select({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, game.leagueId))
      .limit(1)
  ]);
  return {
    homeTeam: names.get(`team:${game.homeTeamId}`) ?? "Home team",
    awayTeam: names.get(`team:${game.awayTeamId}`) ?? "Away team",
    orgId: league[0]?.orgId ?? null
  };
}

export async function queueGameNotice(
  db: Database,
  notify: NotificationService,
  args: {
    game: GameNoticeTarget;
    templateCode: TemplateCode;
    /** Stable per event, e.g. `game.finalized:<gameId>:<finalizedAt>`. */
    eventKey: string;
    orgId: string | null;
    payload: Record<string, unknown>;
  }
): Promise<GameNoticeResult> {
  const recipients = await recipientsFor(db, args.game);
  let queued = 0;
  // Batches of 8: two full rosters can be 30+ people, and queueing them
  // one after another inside the finalize request ran close to the API's
  // 30 s limit. Idempotency keys keep a retried request from doubling up.
  const BATCH = 8;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const rows = await Promise.all(
      recipients.slice(i, i + BATCH).map((r) =>
        notify.queue({
          orgId: args.orgId,
          templateCode: args.templateCode,
          channel: r.email ? "email" : "in_app",
          idempotencyKey: `${args.eventKey}:${r.personId}`,
          recipientPersonId: r.personId,
          recipientEmail: r.email,
          payload: { ...args.payload, gameId: args.game.id, seasonId: args.game.seasonId },
          sourceEvent: args.templateCode
        })
      )
    );
    queued += rows.filter(Boolean).length;
  }
  log.log(
    `${args.templateCode} game=${args.game.id} recipients=${recipients.length} queued=${queued}`
  );
  if (recipients.length === 0) {
    log.warn(`${args.templateCode} game=${args.game.id}: no rostered players or team staff to notify`);
  }
  return { recipients: recipients.length, queued };
}

/** "Sat, Nov 7, 8:00 PM" in the game's zone. */
export function gameTimeLabel(at: Date, tz: string): string {
  try {
    return at.toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  } catch {
    return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
}
