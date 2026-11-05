import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";
import type { NotificationService } from "../../communications/application/notification.service";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Close stale invitations with the game change; never send before commit. */
export async function closeRegionalSubRequests(tx: Tx, notify: NotificationService,
  input: { gameId: string; reason: string; actorId?: string; requestIds?: string[] }) {
  const b = schema.substituteBroadcasts;
  const closed = await tx.update(b).set({ status: "cancelled", closedReason: input.reason, closedAt: new Date(), updatedAt: new Date(),
    log: sql`${b.log} || ${JSON.stringify([{ event: "closed", actorId: input.actorId ?? null, reason: input.reason, at: new Date().toISOString() }])}::jsonb`,
  }).where(and(eq(b.gameId, input.gameId), inArray(b.status, ["pending_review", "approved"]),
    input.requestIds ? inArray(b.id, input.requestIds) : undefined)).returning({ id: b.id, seasonId: b.seasonId });
  if (!closed.length) return { closed: 0, recipients: 0, queued: 0 };
  const ids = closed.map(row => row.id);
  const people = await tx.update(schema.substituteBroadcastRecipients).set({ status: "closed", answeredAt: new Date() })
    .where(and(inArray(schema.substituteBroadcastRecipients.broadcastId, ids), eq(schema.substituteBroadcastRecipients.status, "invited")))
    .returning({ personId: schema.substituteBroadcastRecipients.personId });
  await tx.update(schema.notifications).set({ status: "suppressed", lastError: input.reason, updatedAt: new Date() })
    .where(and(eq(schema.notifications.sourceEvent, "substitute.broadcast.invitation"), inArray(schema.notifications.status, ["queued", "failed"]),
      inArray(sql<string>`${schema.notifications.payload}->>'broadcastId'`, ids)));
  if (!people.length) return { closed: closed.length, recipients: 0, queued: 0 };
  const [season] = await tx.select({ orgId: schema.seasons.orgId }).from(schema.seasons).where(eq(schema.seasons.id, closed[0]!.seasonId));
  if (!season) throw new Error("Regional request season is missing");
  const recipients = await tx.select({ personId: schema.persons.id, email: schema.profiles.email }).from(schema.persons)
    .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId)).where(inArray(schema.persons.id, [...new Set(people.map(person => person.personId))]));
  const queued = await notify.queueAudienceBatch({ orgId: season.orgId, templateCode: "org.broadcast",
    eventKey: `sub-broadcast-closed:${ids.sort().join(":")}`, sourceEvent: "substitute.broadcast.closed", recipients,
    payload: { subject: "Substitute invitation closed", body: `This substitute invitation has closed. ${input.reason}`,
      gameId: input.gameId, broadcastIds: ids, seasonId: closed[0]!.seasonId } }, tx);
  return { closed: closed.length, recipients: recipients.length, queued };
}
