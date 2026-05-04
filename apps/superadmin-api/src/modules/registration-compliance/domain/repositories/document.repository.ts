import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Document } from "../entities/document.entity";
import { DocumentId, DocumentVersionId, ConsentSignatureId } from "../identifiers";

export interface ListDocumentsQuery extends PageQuery {
  orgId?: string;
  kind?: string;
  search?: string;
}

export interface DocumentVersionRow {
  id: string;
  documentId: string;
  versionNumber: number;
  contentHtml: string;
  contentHash: string;
  languageCode: string;
  jurisdictionCountryCode: string | null;
  effectiveFrom: Date;
  supersededAt: Date | null;
  createdAt: Date;
}

export interface ConsentSignatureRow {
  id: string;
  personId: string;
  documentVersionId: string;
  signedAt: Date;
  ipAddr: string | null;
  userAgent: string | null;
  signedByUserId: string | null;
  geolocation: Record<string, unknown> | null;
  signatureBlobUrl: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
}

export interface DocumentRepository {
  findById(id: DocumentId): Promise<Document | null>;
  list(q: ListDocumentsQuery): Promise<Page<Document>>;
  insert(doc: Document): Promise<void>;
  save(doc: Document): Promise<void>;

  // Versions
  findVersion(id: DocumentVersionId): Promise<DocumentVersionRow | null>;
  listVersions(documentId: DocumentId): Promise<DocumentVersionRow[]>;
  insertVersion(row: DocumentVersionRow): Promise<void>;
  supersedePreviousVersions(documentId: DocumentId, exceptId: DocumentVersionId): Promise<void>;
  nextVersionNumber(documentId: DocumentId): Promise<number>;

  // Consent signatures
  findSignature(personId: string, documentVersionId: string): Promise<ConsentSignatureRow | null>;
  insertSignature(row: ConsentSignatureRow): Promise<void>;
  revokeSignature(id: ConsentSignatureId, reason: string): Promise<void>;
  listSignaturesByPerson(personId: string): Promise<ConsentSignatureRow[]>;
}

export const DOCUMENT_REPOSITORY = Symbol("DOCUMENT_REPOSITORY");
