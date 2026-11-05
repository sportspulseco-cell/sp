import { BadRequestException, ConflictException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";

export interface MembershipProofReview {
  identityVerificationId: string;
  expectedExternalId: string;
  expiresAt: string;
  confirmedMatched: true;
}

/** Called inside the document-decision transaction, after locking the document. */
export async function reviewMembershipProof(
  tx: Pick<Database, "select" | "update">,
  document: { id: string; personId: string; kind: string; sha256: string },
  actorUserId: string,
  proof: MembershipProofReview,
): Promise<boolean> {
  if (document.kind !== "governing_body_card" || proof.confirmedMatched !== true) {
    throw new BadRequestException("Confirm the member's name, membership ID and expiry against their governing-body card.");
  }
  const expiry = new Date(proof.expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
    throw new BadRequestException("Membership proof must have a future expiry date.");
  }
  const iv = schema.identityVerifications;
  const [identity] = await tx.select().from(iv).where(and(
    eq(iv.id, proof.identityVerificationId), eq(iv.personId, document.personId),
  )).for("update");
  if (!identity || identity.externalId !== proof.expectedExternalId) {
    throw new ConflictException("The membership ID changed or belongs to another person. Reload and review it again.");
  }
  const metadata = (identity.metadata ?? {}) as Record<string, unknown>;
  const previous = metadata.manualReview as { submissionId?: string } | undefined;
  if (identity.status === "verified" && identity.source === "document_upload" &&
      identity.expiresAt?.getTime() === expiry.getTime() && previous?.submissionId === document.id) return false;
  await tx.update(iv).set({
    status: "verified", source: "document_upload", verifiedAt: new Date(), expiresAt: expiry,
    updatedAt: sql`now()`, metadata: { ...metadata, manualReview: {
      submissionId: document.id, documentSha256: document.sha256,
      reviewerUserId: actorUserId, checkedAt: new Date().toISOString(),
      externalId: identity.externalId, confirmedMatched: true,
    } },
  }).where(eq(iv.id, identity.id));
  return true;
}

/** Revoking this evidence cannot leave a verified membership behind. */
export async function invalidateMembershipProof(tx: Pick<Database, "update">, submissionId: string) {
  const iv = schema.identityVerifications;
  await tx.update(iv).set({ status: "pending", verifiedAt: null, expiresAt: null, updatedAt: sql`now()` })
    .where(and(eq(iv.source, "document_upload"), sql`${iv.metadata}->'manualReview'->>'submissionId' = ${submissionId}`));
}
