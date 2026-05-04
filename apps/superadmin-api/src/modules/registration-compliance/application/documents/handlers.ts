import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  clampLimit,
  ConflictError,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository
} from "../../domain/repositories/document.repository";
import {
  ConsentSignatureId,
  DocumentId,
  DocumentVersionId
} from "../../domain/identifiers";
import { Document } from "../../domain/entities/document.entity";
import {
  type DocumentKind
} from "../../domain/value-objects/statuses.vo";
import {
  ConsentSignatureDto,
  DocumentDto,
  DocumentPageDto,
  DocumentVersionDto
} from "../dtos/document.dto";

// ---- Documents ----

export interface ListDocumentsInput {
  limit?: number;
  cursor?: string;
  orgId?: string;
  kind?: string;
  search?: string;
}

@Injectable()
export class ListDocumentsHandler
  implements QueryHandler<ListDocumentsInput, DocumentPageDto>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: ListDocumentsInput): Promise<DocumentPageDto> {
    const page = await this.docs.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(DocumentDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetDocumentHandler
  implements QueryHandler<{ id: string }, DocumentDto>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: { id: string }): Promise<DocumentDto> {
    const d = await this.docs.findById(DocumentId.of(input.id));
    if (!d) throw new NotFoundError("Document", input.id);
    return DocumentDto.fromDomain(d);
  }
}

export interface CreateDocumentInput {
  kind: DocumentKind;
  name: string;
  orgId?: string | null;
  description?: string | null;
}

@Injectable()
export class CreateDocumentHandler
  implements CommandHandler<CreateDocumentInput, DocumentDto>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: CreateDocumentInput): Promise<DocumentDto> {
    const d = Document.create({
      id: DocumentId.of(randomUUID()),
      ...input
    });
    await this.docs.insert(d);
    return DocumentDto.fromDomain(d);
  }
}

@Injectable()
export class UpdateDocumentHandler
  implements
    CommandHandler<
      { id: string; name?: string; description?: string | null },
      DocumentDto
    >
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: {
    id: string;
    name?: string;
    description?: string | null;
  }): Promise<DocumentDto> {
    const d = await this.docs.findById(DocumentId.of(input.id));
    if (!d) throw new NotFoundError("Document", input.id);
    d.rename(input.name, input.description);
    await this.docs.save(d);
    return DocumentDto.fromDomain(d);
  }
}

// ---- Versions ----

@Injectable()
export class ListDocumentVersionsHandler
  implements QueryHandler<{ documentId: string }, DocumentVersionDto[]>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: { documentId: string }): Promise<DocumentVersionDto[]> {
    const rows = await this.docs.listVersions(DocumentId.of(input.documentId));
    return rows.map(DocumentVersionDto.fromRow);
  }
}

export interface PublishDocumentVersionInput {
  documentId: string;
  contentHtml: string;
  languageCode?: string;
  jurisdictionCountryCode?: string | null;
}

@Injectable()
export class PublishDocumentVersionHandler
  implements CommandHandler<PublishDocumentVersionInput, DocumentVersionDto>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: PublishDocumentVersionInput): Promise<DocumentVersionDto> {
    const docId = DocumentId.of(input.documentId);
    const doc = await this.docs.findById(docId);
    if (!doc) throw new NotFoundError("Document", input.documentId);

    const versionNumber = await this.docs.nextVersionNumber(docId);
    const id = DocumentVersionId.of(randomUUID());
    const contentHash = createHash("sha256").update(input.contentHtml).digest("hex");

    const row = {
      id: id.value,
      documentId: input.documentId,
      versionNumber,
      contentHtml: input.contentHtml,
      contentHash,
      languageCode: input.languageCode ?? "en-US",
      jurisdictionCountryCode: input.jurisdictionCountryCode ?? null,
      effectiveFrom: new Date(),
      supersededAt: null,
      createdAt: new Date()
    };
    await this.docs.insertVersion(row);
    await this.docs.supersedePreviousVersions(docId, id);

    doc.setActiveVersion(id.value);
    await this.docs.save(doc);

    return DocumentVersionDto.fromRow(row);
  }
}

// ---- Signatures ----

export interface SignDocumentInput {
  personId: string;
  documentVersionId: string;
  signedByUserId?: string | null;
  ipAddr?: string | null;
  userAgent?: string | null;
  signatureBlobUrl?: string | null;
  geolocation?: Record<string, unknown> | null;
}

@Injectable()
export class SignDocumentHandler
  implements CommandHandler<SignDocumentInput, ConsentSignatureDto>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: SignDocumentInput): Promise<ConsentSignatureDto> {
    const versionId = DocumentVersionId.of(input.documentVersionId);
    const version = await this.docs.findVersion(versionId);
    if (!version) throw new NotFoundError("DocumentVersion", input.documentVersionId);
    const existing = await this.docs.findSignature(
      input.personId,
      input.documentVersionId
    );
    if (existing && !existing.revokedAt) {
      throw new ConflictError("Person has already signed this version");
    }
    const row = {
      id: randomUUID(),
      personId: input.personId,
      documentVersionId: input.documentVersionId,
      signedAt: new Date(),
      ipAddr: input.ipAddr ?? null,
      userAgent: input.userAgent ?? null,
      signedByUserId: input.signedByUserId ?? null,
      geolocation: input.geolocation ?? null,
      signatureBlobUrl: input.signatureBlobUrl ?? null,
      revokedAt: null,
      revokedReason: null,
      createdAt: new Date()
    };
    await this.docs.insertSignature(row);
    return ConsentSignatureDto.fromRow(row);
  }
}

@Injectable()
export class RevokeSignatureHandler
  implements CommandHandler<{ id: string; reason: string }, { id: string; revoked: boolean }>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: { id: string; reason: string }) {
    if (!input.reason?.trim()) {
      throw new ConflictError("Revoke reason required");
    }
    await this.docs.revokeSignature(ConsentSignatureId.of(input.id), input.reason);
    return { id: input.id, revoked: true };
  }
}

@Injectable()
export class ListPersonSignaturesHandler
  implements QueryHandler<{ personId: string }, ConsentSignatureDto[]>
{
  constructor(@Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository) {}
  async execute(input: { personId: string }): Promise<ConsentSignatureDto[]> {
    const rows = await this.docs.listSignaturesByPerson(input.personId);
    return rows.map(ConsentSignatureDto.fromRow);
  }
}
