import { Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { NotificationService } from "../../../communications/application/notification.service";
import { resolveAnnouncementRecipients } from "../../../../shared/audience/announcements";
import { personContact } from "./handlers";
import type { IssuedAutomatically } from "./suspension-rules";

const log = new Logger("AutoSuspensionNotices");

/**
 * After the finalize commit: tell the suspended player, their team's
 * captains and the league's admins (UC-14). One notice per person per
 * suspension (idempotency key), so a retry cannot double them.
 */
export async function notifyAutomaticSuspensions(
  db: Database,
  notify: NotificationService,
  issued: ReadonlyArray<IssuedAutomatically>,
  scope: { orgId: string | null; leagueId: string; seasonId: string | null }
): Promise<number> {
  let queued = 0;
  for (const s of issued) {
    const who = await personContact(db, s.personId);
    const [team] = s.teamId
      ? await db.select({ name: schema.teams.name }).from(schema.teams).where(eq(schema.teams.id, s.teamId)).limit(1)
      : [];
    const teamName = team?.name ?? "their team";
    const nGamesClause =
      s.kind === "n_games" ? ` for ${s.nGames} game${s.nGames === 1 ? "" : "s"}` : " until a league admin lifts it";
    const base = { personName: who.name, teamName, reason: s.reason, nGamesClause, suspensionId: s.id };
    const sends: Array<Promise<unknown>> = [
      notify.queue({
        orgId: scope.orgId,
        templateCode: "suspension.issued",
        channel: who.email ? "email" : "in_app",
        idempotencyKey: `suspension.issued:${s.id}`,
        recipientPersonId: s.personId,
        recipientEmail: who.email,
        payload: { ...base, kind: "league" },
        sourceEvent: "suspension.automatic"
      })
    ];
    if (scope.orgId) {
      const captains = s.teamId
        ? await resolveAnnouncementRecipients(
            db,
            { teamIds: [s.teamId], leagueIds: [], seasonIds: [], divisionIds: [] },
            scope.orgId,
            ["captains"]
          )
        : [];
      const admins = await resolveAnnouncementRecipients(
        db,
        { teamIds: [], leagueIds: [scope.leagueId], seasonIds: scope.seasonId ? [scope.seasonId] : [], divisionIds: [] },
        scope.orgId,
        ["all_admins"]
      );
      for (const [list, code] of [
        [captains, "suspension.issued.captain"],
        [admins, "suspension.issued.admin"]
      ] as const) {
        for (const r of list) {
          if (r.personId === s.personId) continue;
          sends.push(
            notify.queue({
              orgId: scope.orgId,
              templateCode: code,
              channel: r.email ? "email" : "in_app",
              idempotencyKey: `${code}:${s.id}:${r.personId}`,
              recipientPersonId: r.personId,
              recipientEmail: r.email,
              payload: base,
              sourceEvent: "suspension.automatic"
            })
          );
        }
      }
    }
    const rows = await Promise.all(sends);
    queued += rows.filter(Boolean).length;
  }
  log.log(`automatic suspensions=${issued.length} notices queued=${queued}`);
  return queued;
}
