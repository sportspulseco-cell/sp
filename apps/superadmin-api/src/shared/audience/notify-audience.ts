import { Logger } from "@nestjs/common";
import type { Database } from "@sportspulse/db";
import type { NotificationService } from "../../modules/communications/application/notification.service";
import type { TemplateCode } from "../../modules/communications/domain/templates/catalog";
import {
  resolveAnnouncementRecipients,
  type AnnouncementAudience,
  type AnnouncementTarget
} from "./announcements";

const log = new Logger("NotifyAudience");

/**
 * A notice for the people holding a role around a team, league, season
 * or division: the team's captains, or the admins responsible for a
 * league (org, league, season and division admins). One notice per
 * person, idempotent on `${key}:${personId}`, so a retry never doubles
 * it. People with no sign-in email have no account to read it and are
 * skipped and counted.
 */
export async function notifyAudience(
  db: Database,
  notify: NotificationService,
  args: {
    orgId: string;
    target: Partial<AnnouncementTarget>;
    audiences: readonly AnnouncementAudience[];
    templateCode: TemplateCode;
    key: string;
    payload: Record<string, unknown>;
    sourceEvent?: string;
    /** Already told through another notice (the person it is about). */
    excludePersonIds?: readonly string[];
  }
): Promise<{ recipients: number; queued: number; noEmail: number }> {
  try {
    return await send(db, notify, args);
  } catch (err) {
    // Never fail the caller's action over a notice; say so in the log.
    log.error(`code=${args.templateCode} key=${args.key} failed: ${(err as Error).message}`);
    return { recipients: 0, queued: 0, noEmail: 0 };
  }
}

async function send(
  db: Database,
  notify: NotificationService,
  args: Parameters<typeof notifyAudience>[2]
): Promise<{ recipients: number; queued: number; noEmail: number }> {
  const people = await resolveAnnouncementRecipients(
    db,
    {
      teamIds: args.target.teamIds ?? [],
      leagueIds: args.target.leagueIds ?? [],
      seasonIds: args.target.seasonIds ?? [],
      divisionIds: args.target.divisionIds ?? []
    },
    args.orgId,
    args.audiences
  );
  const skip = new Set(args.excludePersonIds ?? []);
  let queued = 0;
  let noEmail = 0;
  const sends: Array<Promise<unknown>> = [];
  for (const p of people) {
    if (skip.has(p.personId)) continue;
    if (!p.email) {
      noEmail++;
      continue;
    }
    sends.push(
      notify
        .queue({
          orgId: args.orgId,
          templateCode: args.templateCode,
          channel: "email",
          idempotencyKey: `${args.key}:${p.personId}`,
          recipientPersonId: p.personId,
          recipientEmail: p.email,
          payload: args.payload,
          sourceEvent: args.sourceEvent ?? args.templateCode
        })
        .then((row) => {
          if (row) queued++;
        })
    );
  }
  await Promise.all(sends);
  log.log(
    `code=${args.templateCode} key=${args.key} audiences=${args.audiences.join("+")} recipients=${people.length} queued=${queued} noEmail=${noEmail}`
  );
  return { recipients: people.length, queued, noEmail };
}
