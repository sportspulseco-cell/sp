import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, ilike, ne, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Document } from "../../domain/entities/document.entity";
import {
  ConsentSignatureId,
  DocumentId,
  DocumentVersionId
} from "../../domain/identifiers";
import type {
  ConsentSignatureRow,
  DocumentRepository,
  DocumentVersionRow,
  ListDocumentsQuery
} from "../../domain/repositories/document.repository";

@Injectable()
export class DrizzleDocumentRepository implements DocumentRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: DocumentId): Promise<Document | null> {
    const [row] = await this.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListDocumentsQuery): Promise<Page<Document>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.documents.orgId, q.orgId));
    if (q.kind) cs.push(eq(schema.documents.kind, q.kind));
    if (q.search) cs.push(ilike(schema.documents.name, `%${q.search}%`));
    if (q.cursor) cs.push(gt(schema.documents.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.documents)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.documents.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(d: Document): Promise<void> {
    const x = d.toSnapshot();
    await this.db.insert(schema.documents).values({
      id: x.id,
      orgId: x.orgId,
      kind: x.kind,
      name: x.name,
      description: x.description,
      activeVersionId: x.activeVersionId
    });
  }

  async save(d: Document): Promise<void> {
    const x = d.toSnapshot();
    await this.db
      .update(schema.documents)
      .set({
        name: x.name,
        description: x.description,
        activeVersionId: x.activeVersionId,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.documents.id, x.id));
  }

  async findVersion(id: DocumentVersionId): Promise<DocumentVersionRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.id, id.value))
      .limit(1);
    return row ? this.toVersionRow(row) : null;
  }

  async listVersions(documentId: DocumentId): Promise<DocumentVersionRow[]> {
    const rows = await this.db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId.value))
      .orderBy(desc(schema.documentVersions.versionNumber));
    return rows.map((r) => this.toVersionRow(r));
  }

  async insertVersion(row: DocumentVersionRow): Promise<void> {
    await this.db.insert(schema.documentVersions).values({
      id: row.id,
      documentId: row.documentId,
      versionNumber: row.versionNumber,
      contentHtml: row.contentHtml,
      contentHash: row.contentHash,
      languageCode: row.languageCode,
      jurisdictionCountryCode: row.jurisdictionCountryCode,
      effectiveFrom: row.effectiveFrom,
      supersededAt: row.supersededAt
    });
  }

  async supersedePreviousVersions(
    documentId: DocumentId,
    exceptId: DocumentVersionId
  ): Promise<void> {
    await this.db
      .update(schema.documentVersions)
      .set({ supersededAt: sql`NOW()` })
      .where(
        and(
          eq(schema.documentVersions.documentId, documentId.value),
          ne(schema.documentVersions.id, exceptId.value)
        )
      );
  }

  async nextVersionNumber(documentId: DocumentId): Promise<number> {
    const [row] = await this.db
      .select({
        max: sql<number>`COALESCE(MAX(${schema.documentVersions.versionNumber}), 0)`
      })
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId.value));
    return Number(row?.max ?? 0) + 1;
  }

  async findSignature(
    personId: string,
    documentVersionId: string
  ): Promise<ConsentSignatureRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.consentSignatures)
      .where(
        and(
          eq(schema.consentSignatures.personId, personId),
          eq(schema.consentSignatures.documentVersionId, documentVersionId)
        )
      )
      .limit(1);
    return row ? this.toSignatureRow(row) : null;
  }

  async insertSignature(row: ConsentSignatureRow): Promise<void> {
    await this.db.insert(schema.consentSignatures).values({
      id: row.id,
      personId: row.personId,
      documentVersionId: row.documentVersionId,
      signedAt: row.signedAt,
      ipAddr: row.ipAddr,
      userAgent: row.userAgent,
      signedByUserId: row.signedByUserId,
      geolocation: row.geolocation,
      signatureBlobUrl: row.signatureBlobUrl
    });
  }

  async revokeSignature(id: ConsentSignatureId, reason: string): Promise<void> {
    await this.db
      .update(schema.consentSignatures)
      .set({ revokedAt: sql`NOW()`, revokedReason: reason })
      .where(eq(schema.consentSignatures.id, id.value));
  }

  async listSignaturesByPerson(personId: string): Promise<ConsentSignatureRow[]> {
    const rows = await this.db
      .select()
      .from(schema.consentSignatures)
      .where(eq(schema.consentSignatures.personId, personId))
      .orderBy(desc(schema.consentSignatures.signedAt));
    return rows.map((r) => this.toSignatureRow(r));
  }

  private toDomain(r: typeof schema.documents.$inferSelect): Document {
    return Document.rehydrate({
      id: r.id,
      orgId: r.orgId,
      kind: r.kind as never,
      name: r.name,
      description: r.description,
      activeVersionId: r.activeVersionId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }

  private toVersionRow(
    r: typeof schema.documentVersions.$inferSelect
  ): DocumentVersionRow {
    return {
      id: r.id,
      documentId: r.documentId,
      versionNumber: r.versionNumber,
      contentHtml: r.contentHtml,
      contentHash: r.contentHash,
      languageCode: r.languageCode,
      jurisdictionCountryCode: r.jurisdictionCountryCode,
      effectiveFrom: r.effectiveFrom,
      supersededAt: r.supersededAt,
      createdAt: r.createdAt
    };
  }

  private toSignatureRow(
    r: typeof schema.consentSignatures.$inferSelect
  ): ConsentSignatureRow {
    return {
      id: r.id,
      personId: r.personId,
      documentVersionId: r.documentVersionId,
      signedAt: r.signedAt,
      ipAddr: r.ipAddr,
      userAgent: r.userAgent,
      signedByUserId: r.signedByUserId,
      geolocation: r.geolocation as Record<string, unknown> | null,
      signatureBlobUrl: r.signatureBlobUrl,
      revokedAt: r.revokedAt,
      revokedReason: r.revokedReason,
      createdAt: r.createdAt
    };
  }
}
