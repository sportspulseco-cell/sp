import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { RegistrationFormId } from "../identifiers";

export type FormScope = "org" | "league" | "division";

export interface RegistrationFormSnapshot {
  id: string;
  orgId: string;
  scope: FormScope;
  scopeId: string | null;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Aggregate root: RegistrationForm. Versions are managed as a sub-aggregate
// (separate table, separate handler), the form points at the active version.
export class RegistrationForm extends AggregateRoot<RegistrationFormId> {
  private constructor(
    id: RegistrationFormId,
    private readonly _orgId: string,
    private readonly _scope: FormScope,
    private _scopeId: string | null,
    private _name: string,
    private _description: string | null,
    private _activeVersionId: string | null,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: RegistrationFormId;
    orgId: string;
    scope: FormScope;
    scopeId?: string | null;
    name: string;
    description?: string | null;
  }): RegistrationForm {
    if (!input.name?.trim()) {
      throw new DomainError("INVALID_FORM_NAME", "Form name required");
    }
    if (input.scope !== "org" && !input.scopeId) {
      throw new DomainError(
        "MISSING_SCOPE_ID",
        `scopeId is required when scope = ${input.scope}`
      );
    }
    const now = new Date();
    return new RegistrationForm(
      input.id,
      input.orgId,
      input.scope,
      input.scopeId ?? null,
      input.name.trim(),
      input.description ?? null,
      null,
      now,
      now
    );
  }

  static rehydrate(s: RegistrationFormSnapshot): RegistrationForm {
    return new RegistrationForm(
      RegistrationFormId.of(s.id),
      s.orgId,
      s.scope,
      s.scopeId,
      s.name,
      s.description,
      s.activeVersionId,
      s.createdAt,
      s.updatedAt
    );
  }

  rename(name: string, description?: string | null): void {
    if (!name?.trim()) throw new DomainError("INVALID_FORM_NAME", "Required");
    this._name = name.trim();
    if (description !== undefined) this._description = description;
    this._touch();
  }

  setActiveVersion(versionId: string): void {
    this._activeVersionId = versionId;
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  get orgId(): string { return this._orgId; }
  get scope(): FormScope { return this._scope; }
  get scopeId(): string | null { return this._scopeId; }
  get name(): string { return this._name; }
  get description(): string | null { return this._description; }
  get activeVersionId(): string | null { return this._activeVersionId; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): RegistrationFormSnapshot {
    return {
      id: this.id.value,
      orgId: this._orgId,
      scope: this._scope,
      scopeId: this._scopeId,
      name: this._name,
      description: this._description,
      activeVersionId: this._activeVersionId,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
