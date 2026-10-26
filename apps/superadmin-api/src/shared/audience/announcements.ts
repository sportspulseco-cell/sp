import type { Logger } from "@nestjs/common";
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { NotificationService } from "../../modules/communications/application/notification.service";
import { activeMemberPersonIds } from "./org-targets";

/**
 * Written announcements, shared by the league announcement (UC-19,
 * org-admin/broadcast) and the captain's team message (UC-20, MON-12):
 * who gets it, and one idempotent notification per recipient per
 * channel. The server owns the recipient list; callers check the target
 * against the caller first.
 */

export const ANNOUNCEMENT_AUDIENCES = ["captains", "coaches", "players", "referees", "all_admins"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/**
 * Channels an announcement can go out on today. SMS has no provider and
 * push has no subscribed devices yet, so offering them would queue rows
 * that can never be delivered.
 */
export const ANNOUNCEMENT_CHANNELS = ["email", "in_app"] as const;
export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];

const ADMIN_ROLE_CODES = ["org_admin", "league_admin", "season_admin", "division_admin"];

export interface AnnouncementTarget {
  teamIds: string[];
  leagueIds: string[];
  seasonIds: string[];
  divisionIds: string[];
}

/**
 * Distinct people (with their sign-in email) for the audiences, all
 * inside `orgId`. A person in two audiences is listed once.
 */
export async function resolveAnnouncementRecipients(
  db: Database,
  target: AnnouncementTarget,
  orgId: string,
  audiences: readonly AnnouncementAudience[]
): Promise<Array<{ personId: string; email: string | null }>> {
  const personIds = new Set<string>();
  const userIds = new Set<string>();

  if (audiences.includes("players")) {
    for (const id of await activeMemberPersonIds(db, target.teamIds)) personIds.add(id);
  }

  const teamRoles: string[] = [];
  if (audiences.includes("captains")) teamRoles.push("captain");
  if (audiences.includes("coaches")) teamRoles.push("coach");
  if (teamRoles.length && target.teamIds.length) {
    const rows = await db
      .select({ userId: schema.userRoleAssignments.userId })
      .from(schema.userRoleAssignments)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
      .where(
        and(
          eq(schema.userRoleAssignments.scopeType, "team"),
          inArray(schema.userRoleAssignments.scopeId, target.teamIds),
          inArray(schema.roles.code, teamRoles),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    for (const r of rows) userIds.add(r.userId);
  }
  // teams.captain_user_id is the other captain record (userIsCaptainOfTeam
  // accepts it); a team whose captain has no team-scoped role row used to
  // get no captain notices at all.
  if (audiences.includes("captains") && target.teamIds.length) {
    const rows = await db
      .select({ userId: schema.teams.captainUserId })
      .from(schema.teams)
      .where(inArray(schema.teams.id, target.teamIds));
    for (const r of rows) if (r.userId) userIds.add(r.userId);
  }

  if (audiences.includes("referees") && target.leagueIds.length) {
    const rows = await db
      .select({ userId: schema.userRoleAssignments.userId })
      .from(schema.userRoleAssignments)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
      .where(
        and(
          eq(schema.userRoleAssignments.scopeType, "league"),
          inArray(schema.userRoleAssignments.scopeId, target.leagueIds),
          eq(schema.roles.code, "referee"),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    for (const r of rows) userIds.add(r.userId);
  }

  if (audiences.includes("all_admins")) {
    const scoped = [
      and(eq(schema.userRoleAssignments.scopeType, "org"), eq(schema.userRoleAssignments.scopeId, orgId))
    ];
    if (target.leagueIds.length) {
      scoped.push(
        and(
          eq(schema.userRoleAssignments.scopeType, "league"),
          inArray(schema.userRoleAssignments.scopeId, target.leagueIds)
        )
      );
    }
    if (target.seasonIds.length) {
      scoped.push(
        and(
          eq(schema.userRoleAssignments.scopeType, "season"),
          inArray(schema.userRoleAssignments.scopeId, target.seasonIds)
        )
      );
    }
    if (target.divisionIds.length) {
      scoped.push(
        and(
          eq(schema.userRoleAssignments.scopeType, "division"),
          inArray(schema.userRoleAssignments.scopeId, target.divisionIds)
        )
      );
    }
    const rows = await db
      .select({ userId: schema.userRoleAssignments.userId })
      .from(schema.userRoleAssignments)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
      .where(
        and(
          or(...scoped),
          inArray(schema.roles.code, ADMIN_ROLE_CODES),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    for (const r of rows) userIds.add(r.userId);
  }

  if (userIds.size > 0) {
    const persons = await db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(inArray(schema.persons.userId, [...userIds]));
    for (const p of persons) personIds.add(p.id);
  }
  if (personIds.size === 0) return [];

  const persons = await db
    .select({ id: schema.persons.id, email: schema.profiles.email })
    .from(schema.persons)
    .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
    .where(inArray(schema.persons.id, [...personIds]));
  return persons.map((p) => ({ personId: p.id, email: p.email }));
}

export interface AnnouncementResult {
  broadcastId: string;
  idempotent: boolean;
  recipients: number;
  audiencesResolved: number;
  queued: number;
  /** Rows the notification service could not write (see API log). */
  failed: number;
  /** Email channel skipped: the person has no email on file. */
  noEmail: number;
  channels: AnnouncementChannel[];
}

/**
 * Queue one notification per recipient per channel, idempotent on
 * `broadcast-<key>-<personId>-<channel>`. A replay with a key that was
 * already used returns the first result without sending again.
 */
export async function sendAnnouncement(
  db: Database,
  notify: NotificationService,
  log: Logger,
  args: {
    orgId: string;
    idempotencyKey?: string;
    channels: AnnouncementChannel[];
    /** Resolved lazily so a replay does not look anyone up. */
    recipients: () => Promise<Array<{ personId: string; email: string | null }>>;
    payload: Record<string, unknown> & { subject: string; body: string };
    sourceEvent: string;
    /** For the log line. */
    describe: string;
  }
): Promise<AnnouncementResult> {
  const broadcastId =
    args.idempotencyKey ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const keyPrefix = `broadcast-${broadcastId}-`;

  if (args.idempotencyKey) {
    const [prior] = await db
      .select({
        rows: sql<number>`COUNT(*)::int`,
        people: sql<number>`COUNT(DISTINCT ${schema.notifications.recipientPersonId})::int`
      })
      .from(schema.notifications)
      .where(like(schema.notifications.idempotencyKey, `${keyPrefix}%`));
    if (Number(prior?.rows ?? 0) > 0) {
      log.log(`${args.sourceEvent} replay key=${broadcastId} ${args.describe} rows=${prior?.rows}`);
      return {
        broadcastId,
        idempotent: true,
        recipients: Number(prior?.people ?? 0),
        audiencesResolved: Number(prior?.people ?? 0),
        queued: Number(prior?.rows ?? 0),
        failed: 0,
        noEmail: 0,
        channels: args.channels
      };
    }
  }

  const recipients = await args.recipients();
  let queued = 0;
  let failed = 0;
  let noEmail = 0;
  for (const r of recipients) {
    for (const channel of args.channels) {
      if (channel === "email" && !r.email) {
        noEmail += 1;
        continue;
      }
      const row = await notify.queue({
        orgId: args.orgId,
        templateCode: "org.broadcast",
        channel,
        idempotencyKey: `${keyPrefix}${r.personId}-${channel}`,
        recipientPersonId: r.personId,
        recipientEmail: channel === "email" ? r.email : null,
        payload: { ...args.payload, broadcastId },
        sourceEvent: args.sourceEvent
      });
      if (row) queued += 1;
      else failed += 1;
    }
  }
  log.log(
    `${args.sourceEvent} key=${broadcastId} ${args.describe} channels=${args.channels.join(",")} recipients=${recipients.length} queued=${queued} failed=${failed} noEmail=${noEmail}`
  );
  return {
    broadcastId,
    idempotent: false,
    recipients: recipients.length,
    audiencesResolved: recipients.length,
    queued,
    failed,
    noEmail,
    channels: args.channels
  };
}
