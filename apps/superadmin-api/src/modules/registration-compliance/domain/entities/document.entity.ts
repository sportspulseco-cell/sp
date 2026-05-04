import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { DocumentId } from "../identifiers";
import {
  type DocumentKind,
  assertDocumentKind
} from "../value-objects/statuses.vo";

export interface DocumentSnapshot {
  id: string;
  orgId: string | null;
  kind: DocumentKind;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Document extends AggregateRoot<DocumentId> {
  private constructor(
    id: DocumentId,
    private readonly _orgId: string | null,
    private readonly _kind: DocumentKind,
    private _name: string,
    private _description: string | null,
    private _activeVersionId: string | null,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: DocumentId;
    orgId?: string | null;
    kind: DocumentKind;
    name: string;
    description?: string | null;
  }): Document {
    if (!input.name?.trim()) {
      throw new DomainError("INVALID_DOCUMENT_NAME", "Name required");
    }
    const now = new Date();
    return new Document(
      input.id,
      input.orgId ?? null,
      assertDocumentKind(input.kind),
      input.name.trim(),
      input.description ?? null,
      null,
      now,
      now
    );
  }

  static rehydrate(s: DocumentSnapshot): Document {
    return new Document(
      DocumentId.of(s.id),
      s.orgId,
      assertDocumentKind(s.kind),
      s.name,
      s.description,
      s.activeVersionId,
      s.createdAt,
      s.updatedAt
    );
  }

  rename(name?: string, description?: string | null): void {
    if (name !== undefined) {
      if (!name.trim()) throw new DomainError("INVALID_DOCUMENT_NAME", "Required");
      this._name = name.trim();
    }
    if (description !== undefined) this._description = description;
    this._touch();
  }

  setActiveVersion(versionId: string): void {
    this._activeVersionId = versionId;
    this._touch();
  }

  private _touch(): void { this._updatedAt = new Date(); }

  get orgId(): string | null { return this._orgId; }
  get kind(): DocumentKind { return this._kind; }
  get name(): string { return this._name; }
  get description(): string | null { return this._description; }
  get activeVersionId(): string | null { return this._activeVersionId; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): DocumentSnapshot {
    return {
      id: this.id.value,
      orgId: this._orgId,
      kind: this._kind,
      name: this._name,
      description: this._description,
      activeVersionId: this._activeVersionId,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
