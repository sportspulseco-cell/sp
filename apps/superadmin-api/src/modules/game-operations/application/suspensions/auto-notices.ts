import { Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { NotificationService } from "../../../communications/application/notification.service";
import { notifyAudience } from "../../../../shared/audience/notify-audience";
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
    const row = await notify.queue({
      orgId: scope.orgId,
      templateCode: "suspension.issued",
      channel: who.email ? "email" : "in_app",
      idempotencyKey: `suspension.issued:${s.id}`,
      recipientPersonId: s.personId,
      recipientEmail: who.email,
      payload: { ...base, kind: "league" },
      sourceEvent: "suspension.automatic"
    });
    if (row) queued++;
    if (scope.orgId) {
      const sends = [
        s.teamId
          ? notifyAudience(db, notify, {
              orgId: scope.orgId,
              target: { teamIds: [s.teamId] },
              audiences: ["captains"],
              templateCode: "suspension.issued.captain",
              key: `suspension.issued.captain:${s.id}`,
              payload: base,
              sourceEvent: "suspension.automatic",
              excludePersonIds: [s.personId]
            })
          : null,
        notifyAudience(db, notify, {
          orgId: scope.orgId,
          target: { leagueIds: [scope.leagueId], seasonIds: scope.seasonId ? [scope.seasonId] : [] },
          audiences: ["all_admins"],
          templateCode: "suspension.issued.admin",
          key: `suspension.issued.admin:${s.id}`,
          payload: base,
          sourceEvent: "suspension.automatic",
          excludePersonIds: [s.personId]
        })
      ];
      for (const r of await Promise.all(sends)) queued += r?.queued ?? 0;
    }
  }
  log.log(`automatic suspensions=${issued.length} notices queued=${queued}`);
  return queued;
}
