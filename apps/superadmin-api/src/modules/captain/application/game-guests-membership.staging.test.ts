import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb, schema } from "@sportspulse/db";
import { addGameGuest } from "./game-guests";
import { SubstituteRequestsService } from "./substitute-requests.service";
import type { Database } from "@sportspulse/db";

test("required membership proof cannot be bypassed through a guest or name-only walk-in", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const ids = JSON.parse(readFileSync("test-results-season/latest.json", "utf8")).ids;
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("guest membership fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const [game] = await tx.select().from(schema.games).where(sql`${schema.games.seasonId}=${ids.seasonId}::uuid AND ${schema.games.status}='scheduled'`).limit(1);
    assert.ok(game);
    await tx.execute(sql`update seasons set config=config||'{"requireUsaHockeyId":true}'::jsonb where id=${ids.seasonId}::uuid`);
    const personId = randomUUID();
    await tx.insert(schema.persons).values({ id: personId, legalFirstName: "QA Morgan", legalLastName: "Guest" });
    const [body] = await tx.select().from(schema.governingBodies).where(eq(schema.governingBodies.code, "USA_HOCKEY")); assert.ok(body);
    const input = { gameId: game.id, teamId: game.homeTeamId, seasonId: ids.seasonId, personId,
      actorUserId: process.env.STAGING_SUPERADMIN_ID! };
    const refusal = (error: unknown) => String(error).includes("Staff must verify");
    await assert.rejects(addGameGuest(tx, { ...input, personId: undefined, guestName: "QA Walk In" }), refusal);
    await assert.rejects(addGameGuest(tx, input), refusal);
    const [identity] = await tx.insert(schema.identityVerifications).values({ personId, governingBodyId: body.id,
      externalId: "QA-GUEST-PROOF", status: "pending", expiresAt: new Date("2099-01-01") }).returning(); assert.ok(identity);
    await tx.insert(schema.freeAgentPoolEntries).values({ playerPersonId: personId, seasonId: ids.seasonId,
      positions: ["G"], levelPrimary: "A", availability: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: true } });
    const subs = new SubstituteRequestsService(tx as unknown as Database, {} as never, {} as never);
    const context = await subs.requireAdminGame(process.env.STAGING_SUPERADMIN_ID!, game.id);
    const [pending] = await subs.candidatesFor(tx, context, game.homeTeamId, { personIds: [personId] });
    assert.ok(pending); assert.ok(pending.reasons.includes("membership_proof")); assert.equal(pending.adminOverridable, false);
    await assert.rejects(addGameGuest(tx, input), refusal);
    await tx.update(schema.identityVerifications).set({ status: "verified" }).where(eq(schema.identityVerifications.id, identity.id));
    await assert.rejects(addGameGuest(tx, input), refusal);
    await tx.update(schema.identityVerifications).set({ verifiedAt: new Date(), expiresAt: new Date(game.scheduledStartTsUtc.getTime() - 1) }).where(eq(schema.identityVerifications.id, identity.id));
    await assert.rejects(addGameGuest(tx, input), refusal);
    assert.equal((await tx.execute(sql`select id from game_attendance where person_id=${personId}::uuid`)).length, 0);
    await tx.update(schema.identityVerifications).set({ expiresAt: new Date("2099-01-01") }).where(eq(schema.identityVerifications.id, identity.id));
    const [cleared] = await subs.candidatesFor(tx, context, game.homeTeamId, { personIds: [personId] });
    assert.ok(cleared); assert.equal(cleared.reasons.includes("membership_proof"), false);
    await tx.update(schema.games).set({ gameType: "playoff" }).where(eq(schema.games.id, game.id));
    const playoffRefusal = (error: unknown) => String(error).includes("Staff must review");
    await assert.rejects(addGameGuest(tx, input), playoffRefusal);
    await tx.execute(sql`update seasons set config=config||'{"requireUsaHockeyId":false}'::jsonb where id=${ids.seasonId}::uuid`);
    await assert.rejects(addGameGuest(tx, { ...input, personId: undefined, guestName: "QA Playoff Walk In" }), playoffRefusal);
    const [eligibility] = await tx.insert(schema.eligibilityRecords).values({ personId, seasonId: ids.seasonId,
      status: "eligible", ruleEvaluation: {}, effectiveFrom: new Date(game.scheduledStartTsUtc.getTime() - 86400000) }).returning();
    assert.ok(eligibility);
    await assert.rejects(addGameGuest(tx, input), playoffRefusal);
    await tx.update(schema.eligibilityRecords).set({ status: "waived", waiverReason: "QA reviewed history",
      effectiveTo: new Date(game.scheduledStartTsUtc.getTime() - 1) }).where(eq(schema.eligibilityRecords.id, eligibility.id));
    await assert.rejects(addGameGuest(tx, input), playoffRefusal);
    await tx.update(schema.eligibilityRecords).set({ status: "eligible", effectiveTo: null,
      ruleEvaluation: { playoffEligibility: { status: "eligible" } } }).where(eq(schema.eligibilityRecords.id, eligibility.id));
    const accepted = await addGameGuest(tx, input);
    assert.equal(accepted.attendance.personId, personId); assert.equal(accepted.attendance.isGuest, true);
    throw rollback;
  }), error => error === rollback);
});
