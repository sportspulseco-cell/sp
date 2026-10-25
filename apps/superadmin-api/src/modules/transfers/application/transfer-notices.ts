import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { NotificationService } from "../../communications/application/notification.service";
import type { TemplateCode } from "../../communications/domain/templates/catalog";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import { notifyAudience } from "../../../shared/audience/notify-audience";

/**
 * Notices about one transfer: to the player and to the captains of the
 * teams involved, with names rather than ids. Keys are per transfer and
 * per person, so a retry never sends twice (COMP-19).
 */
export async function notifyTransfer(
  db: Database,
  notify: NotificationService,
  args: {
    transfer: { id: string; orgId: string; seasonId: string; personId: string; fromTeamId: string; toTeamId: string };
    templateCode: TemplateCode;
    key: string;
    toPlayer: boolean;
    captainsOf: ReadonlyArray<"from" | "to">;
    /** The admins of the transfer's league and season (they approve it). */
    toAdmins?: boolean;
    extra?: Record<string, unknown>;
    /** The person who acted; they already know. */
    excludePersonIds?: readonly string[];
  }
): Promise<void> {
  const t = args.transfer;
  const names = await resolveEntityNames(db, [
    { type: "person", id: t.personId },
    { type: "team", id: t.fromTeamId },
    { type: "team", id: t.toTeamId }
  ]);
  const fromTeam = names.get(`team:${t.fromTeamId}`) ?? "their team";
  const payload = {
    transferId: t.id,
    playerName: names.get(`person:${t.personId}`) ?? "A player",
    sourceTeam: fromTeam,
    fromTeam,
    toTeam: names.get(`team:${t.toTeamId}`) ?? "the other team",
    ...(args.extra ?? {})
  };
  const skip = new Set(args.excludePersonIds ?? []);
  if (args.toPlayer && !skip.has(t.personId)) {
    await notify.queue({
      orgId: t.orgId,
      templateCode: args.templateCode,
      idempotencyKey: `${args.key}:${t.personId}`,
      recipientPersonId: t.personId,
      payload
    });
  }
  const teamIds = args.captainsOf.map((side) => (side === "from" ? t.fromTeamId : t.toTeamId));
  if (teamIds.length) {
    await notifyAudience(db, notify, {
      orgId: t.orgId,
      target: { teamIds },
      audiences: ["captains"],
      templateCode: args.templateCode,
      key: args.key,
      payload,
      excludePersonIds: [...skip, ...(args.toPlayer ? [t.personId] : [])]
    });
  }
  if (args.toAdmins) {
    const [season] = await db
      .select({ leagueId: schema.seasons.leagueId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, t.seasonId))
      .limit(1);
    await notifyAudience(db, notify, {
      orgId: t.orgId,
      target: { leagueIds: season ? [season.leagueId] : [], seasonIds: [t.seasonId] },
      audiences: ["all_admins"],
      templateCode: args.templateCode,
      key: args.key,
      payload,
      excludePersonIds: [...skip]
    });
  }
}
