import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb, schema, type Database } from "@sportspulse/db";
import { SubstituteRequestsService } from "./substitute-requests.service";
import { RegionalSubstitutesService } from "./regional-substitutes.service";
import { NotificationService, type NotificationTransaction } from "../../communications/application/notification.service";
import { DrizzleNotificationRepository } from "../../communications/infrastructure/repositories/drizzle-notification.repository";
import type { NotificationRow } from "../../communications/domain/repositories/notification.repository";

test("regional substitutes require approval, match across leagues privately, and admit only one volunteer for the last spot", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1", timeout: 180_000,
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const { ids } = JSON.parse(readFileSync("test-results-season/latest.json", "utf8"));
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("regional substitute fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const gameId = randomUUID(), tag = randomUUID().slice(0, 8), connection = tx as unknown as Database;
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g)||jsonb_build_object(
      'id',${gameId}::text,'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual','status','scheduled',
      'published_at',now(),'finalized_at',null,'game_type','regular','home_score',0,'away_score',0,
      'scheduled_start_ts_utc','2097-03-01T20:00:00Z','duration_min',60,'tz','UTC','metadata','{}'::jsonb
    ))).* from games g where season_id=${ids.seasonId}::uuid limit 1`);
    const realNotify = new NotificationService({} as never, {} as never, {} as never, {} as never, connection);
    let failInvitations = true, failClosure = false;
    const notify = { queueAudienceBatch: async (args: Parameters<NotificationService["queueAudienceBatch"]>[0], noticeTx: NotificationTransaction) => {
      const count = await realNotify.queueAudienceBatch(args, noticeTx);
      if (failInvitations && args.sourceEvent === "substitute.broadcast.invitation") throw new Error("injected regional invitation failure");
      if (failClosure && args.sourceEvent === "substitute.broadcast.closed") throw new Error("injected regional closure failure");
      return count;
    } };
    const subs = new SubstituteRequestsService(connection, realNotify, {} as never);
    const regional = new RegionalSubstitutesService(connection, subs, notify as NotificationService);
    const game = await subs.loadGame(gameId, tx); assert.ok(game);
    const first = (await subs.candidatesFor(tx, game, game.homeTeamId)).filter(candidate => candidate.eligible).slice(0, 3);
    assert.equal(first.length, 3, "Three rostered candidates outside this game are required");
    const [team] = await tx.select().from(schema.teams).where(eq(schema.teams.id, game.homeTeamId)); assert.ok(team?.captainUserId);
    const captain = team.captainUserId, staff = process.env.STAGING_SUPERADMIN_ID!;
    const [region, otherRegion] = await tx.insert(schema.regions).values([
      { orgId: ids.orgId, name: `QA Regional ${tag}` }, { orgId: ids.orgId, name: `QA Elsewhere ${tag}` },
    ]).returning(); assert.ok(region && otherRegion);
    await tx.update(schema.divisions).set({ regionId: region.id, tier: "A" }).where(eq(schema.divisions.id, game.divisionId!));
    const [body] = await tx.select().from(schema.governingBodies).where(eq(schema.governingBodies.code, "USA_HOCKEY")); assert.ok(body);
    const participants: Array<{ personId: string; userId: string }> = [];
    for (const [index, candidate] of first.entries()) {
      const [person] = await tx.select().from(schema.persons).where(eq(schema.persons.id, candidate.personId)); assert.ok(person?.userId);
      participants.push({ personId: person.id, userId: person.userId });
      await tx.update(schema.persons).set({ dobDate: "1990-01-01", genderSelfId: "male" }).where(eq(schema.persons.id, person.id));
      await tx.insert(schema.identityVerifications).values({ personId: person.id, governingBodyId: body.id,
        externalId: `QA-${tag}-${index}`, status: "verified", source: "document_upload", verifiedAt: new Date(), expiresAt: new Date("2099-01-01") });
      await regional.subscribe(person.userId, index === 2 ? otherRegion.id : region.id, true, ["G"]);
    }
    // One opted-in volunteer belongs to a different league and season.
    const leagueId = randomUUID(), seasonId = randomUUID(), divisionId = randomUUID(), candidate = participants[0]!;
    await tx.execute(sql`insert into leagues select (jsonb_populate_record(null::leagues,to_jsonb(l)||jsonb_build_object('id',${leagueId}::text,'name',${`QA Other Hockey ${tag}`}::text))).* from leagues l where id=${game.leagueId}::uuid`);
    await tx.execute(sql`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s)||jsonb_build_object('id',${seasonId}::text,'league_id',${leagueId}::text,'name',${`QA Other Season ${tag}`}::text,'metadata','{}'::jsonb))).* from seasons s where id=${game.seasonId}::uuid`);
    await tx.execute(sql`insert into divisions select (jsonb_populate_record(null::divisions,to_jsonb(d)||jsonb_build_object('id',${divisionId}::text,'season_id',${seasonId}::text))).* from divisions d where id=${game.divisionId}::uuid`);
    const [membership] = await tx.select().from(schema.teamMemberships).where(sql`person_id=${candidate.personId}::uuid AND season_id=${game.seasonId}::uuid AND current_status='active'`).limit(1); assert.ok(membership);
    await tx.execute(sql`insert into division_team_entries select (jsonb_populate_record(null::division_team_entries,to_jsonb(e)||jsonb_build_object('id',gen_random_uuid()::text,'division_id',${divisionId}::text,'invoice_id',null))).* from division_team_entries e join divisions d on d.id=e.division_id where e.team_id=${membership.teamId}::uuid and d.season_id=${game.seasonId}::uuid and e.left_at is null limit 1`);
    await tx.update(schema.teamMemberships).set({ seasonId }).where(eq(schema.teamMemberships.id, membership.id));
    await tx.execute(sql`update seasons set config=config||'{"requireUsaHockeyId":true}'::jsonb where id=${game.seasonId}::uuid`);
    const regionalCandidates = await subs.candidatesFor(tx, game, team.id, { personIds: participants.slice(0, 2).map(p => p.personId), regional: true });
    assert.equal(regionalCandidates.length, 2, "Both source memberships must be eligible before approval is exercised");
    const input = { requestKey: randomUUID(), position: "goalie" as const, needed: 1, note: "A goalie is needed for this game." };
    await assert.rejects(regional.create(participants[0]!.userId, team.id, gameId, input), /Team not found/);
    const request = await regional.create(captain, team.id, gameId, input);
    assert.equal(request.status, "pending_review"); assert.equal(request.invitedCount, 0);
    assert.equal((await regional.create(captain, team.id, gameId, input)).id, request.id);
    await assert.rejects(regional.review(captain, request.id, "approve"), /Request not found/);
    await assert.rejects(regional.review(staff, request.id, "approve"), /injected regional invitation failure/);
    const [unchanged] = await tx.select().from(schema.substituteBroadcasts).where(eq(schema.substituteBroadcasts.id, request.id));
    assert.equal(unchanged!.status, "pending_review");
    assert.equal((await tx.execute(sql`select id from substitute_broadcast_recipients where broadcast_id=${request.id}::uuid`)).length, 0);
    failInvitations = false;
    const approved = await regional.review(staff, request.id, "approve");
    assert.equal(approved.invitedCount, 2, "Same-region volunteers across leagues must match; other-region subscribers must not");
    assert.equal((await regional.review(staff, request.id, "approve")).invitedCount, 2);
    const raw = JSON.stringify(await regional.captainView(captain, team.id, gameId));
    for (const field of ["email", "dob", "availability", "metadata", "externalId"]) assert.equal(raw.includes(`\"${field}\"`), false);
    assert.equal((await regional.mine(participants[0]!.userId)).invitations.length, 1);
    const poison = new Proxy({}, { get() { throw new Error("External notification transport must never be reached for a stale invitation"); } });
    const guardedNotify = new NotificationService(new DrizzleNotificationRepository(connection), poison as never, poison as never, poison as never, connection);
    const invitationFor = async (broadcastId: string, personId: string) => {
      const [row] = await tx.select().from(schema.notifications).where(sql`source_event='substitute.broadcast.invitation' AND payload->>'broadcastId'=${broadcastId} AND recipient_person_id=${personId}::uuid AND channel='email'`).limit(1);
      assert.ok(row); return row as NotificationRow;
    };
    const secondInvitation = await invitationFor(request.id, participants[1]!.personId);
    await regional.subscribe(participants[1]!.userId, region.id, true, ["C"]);
    await guardedNotify.dispatch(secondInvitation);
    assert.equal((await tx.select().from(schema.notifications).where(eq(schema.notifications.id, secondInvitation.id)))[0]!.status, "suppressed", "A changed position must invalidate the queued goalie invitation before any transport is called");
    await regional.subscribe(participants[1]!.userId, region.id, true, ["G"]);
    await assert.rejects(regional.answer(captain, request.id, "accept"), /Invitation not found/);
    const accepted = await regional.answer(participants[0]!.userId, request.id, "accept");
    assert.equal(accepted.response, "accepted"); assert.equal(accepted.broadcast.filled, 1); assert.equal(accepted.broadcast.status, "filled");
    assert.equal((await regional.answer(participants[0]!.userId, request.id, "accept")).response, "accepted");
    await assert.rejects(regional.answer(participants[1]!.userId, request.id, "accept"), /no longer open/);
    const [guests] = await tx.execute(sql`select count(*)::int n from game_attendance where game_id=${gameId}::uuid and is_guest=true`);
    assert.equal(guests!.n, 1);
    // The first volunteer is now a guest, so a fresh request can invite
    // only the remaining eligible volunteer. Cancellation and its notice
    // are committed together, including a provider-independent outbox.
    const replacement = await regional.create(captain, team.id, gameId, { ...input, requestKey: randomUUID() });
    const replacementApproved = await regional.review(staff, replacement.id, "approve");
    assert.equal(replacementApproved.invitedCount, 1);
    const stale = await invitationFor(replacement.id, participants[1]!.personId);
    failClosure = true;
    await assert.rejects(regional.cancel(captain, team.id, replacement.id), /injected regional closure failure/);
    assert.equal((await tx.select().from(schema.substituteBroadcasts).where(eq(schema.substituteBroadcasts.id, replacement.id)))[0]!.status, "approved");
    assert.equal((await tx.select().from(schema.notifications).where(eq(schema.notifications.id, stale.id)))[0]!.status, "queued");
    failClosure = false;
    assert.equal((await regional.cancel(captain, team.id, replacement.id)).status, "cancelled");
    await guardedNotify.dispatch(stale);
    assert.equal((await tx.select().from(schema.notifications).where(eq(schema.notifications.id, stale.id)))[0]!.status, "suppressed");
    await assert.rejects(regional.answer(participants[1]!.userId, replacement.id, "accept"), /no longer open/);
    assert.equal((await regional.mine(participants[0]!.userId)).invitations[0]!.response, "accepted", "Confirmed guests remain visible when remaining invitations are closed");
    await regional.subscribe(participants[1]!.userId, region.id, false, []);
    assert.equal((await tx.select().from(schema.substituteSubscriptions).where(sql`person_id=${participants[1]!.personId}::uuid AND region_id=${region.id}::uuid`)).length, 0);
    const [privacy] = await tx.execute(sql`select bool_and(relrowsecurity) rls from pg_class where oid in ('substitute_subscriptions'::regclass,'substitute_broadcasts'::regclass,'substitute_broadcast_recipients'::regclass)`);
    assert.equal(privacy!.rls, true);
    const [grants] = await tx.execute(sql`select has_table_privilege('authenticated','substitute_subscriptions','select') access`); assert.equal(grants!.access, false);
    throw rollback;
  }), error => error === rollback);
});
