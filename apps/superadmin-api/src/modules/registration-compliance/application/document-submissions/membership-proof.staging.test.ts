import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createDb, schema, type Database } from "@sportspulse/db";
import { reviewMembershipProof, invalidateMembershipProof } from "./membership-proof";
import { ComplianceDocumentSubmissionsService } from "./document-submissions.service";
import type { UserScope } from "../../../../shared/auth/scope";

test("staff membership review is scoped, atomic, replay-safe and revoked with its evidence", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("membership fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const personId = randomUUID();
    await tx.insert(schema.persons).values({ id: personId, legalFirstName: "Morgan", legalLastName: "Bennett" });
    const [body] = await tx.select().from(schema.governingBodies).where(eq(schema.governingBodies.code, "USA_HOCKEY"));
    assert.ok(body, "USA Hockey governing body fixture is required");
    const [identity] = await tx.insert(schema.identityVerifications).values({ personId, governingBodyId: body.id, externalId: "ABC123456" }).returning();
    assert.ok(identity);
    const [document] = await tx.insert(schema.complianceDocumentSubmissions).values({ personId,
      orgId: process.env.STAGING_ORG_ENTITY_ID!, kind: "governing_body_card", storagePath: `qa/${randomUUID()}`,
      contentType: "application/pdf", sizeBytes: 10, sha256: "a".repeat(64),
    }).returning();
    assert.ok(document);
    const proof = { identityVerificationId: identity.id, expectedExternalId: identity.externalId,
      expiresAt: "2099-08-31T23:59:59.999Z", confirmedMatched: true as const };
    const actor = process.env.STAGING_SUPERADMIN_ID!;
    await assert.rejects(reviewMembershipProof(tx, { ...document, personId: randomUUID() }, actor, proof), /another person/);
    await assert.rejects(reviewMembershipProof(tx, document, actor, { ...proof, expectedExternalId: "CHANGED" }), /changed/);
    await assert.rejects(reviewMembershipProof(tx, document, actor, { ...proof, expiresAt: "2020-01-01" }), /future expiry/);
    await assert.rejects(reviewMembershipProof(tx, { ...document, kind: "government_id" }, actor, proof), /governing-body card/);
    const database = tx as unknown as Database;
    const service = new ComplianceDocumentSubmissionsService(database, {} as never,
      { queue: async () => ({}) } as never, {} as never, {} as never,
      { refreshPersonMembership: async () => undefined } as never);
    // Notifications are independently covered; no email/SMS leaves this transaction.
    Object.assign(service, { notifyDecision: async () => 0 });
    const scope: UserScope = { isSuperAdmin: true, leagueIds: null, orgIds: null, teamIds: null, orgWideOrgIds: null };
    const denied: UserScope = { isSuperAdmin: false, leagueIds: [], orgIds: [], teamIds: [], orgWideOrgIds: [] };
    await assert.rejects(service.decide({ scope: denied, actorUserId: actor, id: document.id, decision: "approved", membershipProof: proof }), /not found/);
    await assert.rejects(service.decide({ scope, actorUserId: actor, id: document.id, decision: "approved" }), /confirm the card/);
    const accepted = await service.decide({ scope, actorUserId: actor, id: document.id, decision: "approved", membershipProof: proof });
    assert.equal(accepted.submission.status, "approved");
    const [verified] = await tx.select().from(schema.identityVerifications).where(eq(schema.identityVerifications.id, identity.id));
    assert.equal(verified?.status, "verified"); assert.equal(verified?.source, "document_upload");
    assert.equal((verified?.metadata as { manualReview: { reviewerUserId: string } }).manualReview.reviewerUserId, actor);
    const replay = await service.decide({ scope, actorUserId: actor, id: document.id, decision: "approved", membershipProof: proof });
    assert.equal(replay.alreadyDecided, true);
    const evidence = await tx.execute(sql`select id from compliance_document_decisions where submission_id=${document.id}::uuid`);
    assert.equal(evidence.length, 1);
    await service.decide({ scope, actorUserId: actor, id: document.id, decision: "resubmit_requested", reason: "Please provide the current membership card." });
    const [revoked] = await tx.select().from(schema.identityVerifications).where(eq(schema.identityVerifications.id, identity.id));
    assert.equal(revoked?.status, "pending"); assert.equal(revoked?.verifiedAt, null);
    await invalidateMembershipProof(tx, document.id); // repeat invalidation is safe
    throw rollback;
  }), e => e === rollback);
});
