import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { RegistrationId } from "../identifiers";
import {
  type RegistrationStatus,
  assertRegistrationStatus,
  canTransitionRegistration
} from "../value-objects/statuses.vo";

export interface RegistrationItem {
  fieldKey: string;
  value: unknown;
  encrypted: boolean;
}

export interface RegistrationSnapshot {
  id: string;
  idempotencyKey: string;
  orgId: string;
  formVersionId: string;
  submittedByUserId: string | null;
  subjectPersonId: string;
  status: RegistrationStatus;
  leagueId: string | null;
  divisionId: string | null;
  teamId: string | null;
  submittedAt: Date | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  decisionReason: string | null;
  metadata: Record<string, unknown>;
  items: RegistrationItem[];
  createdAt: Date;
  updatedAt: Date;
}

export class Registration extends AggregateRoot<RegistrationId> {
  private constructor(
    id: RegistrationId,
    private readonly _idempotencyKey: string,
    private readonly _orgId: string,
    private readonly _formVersionId: string,
    private readonly _submittedByUserId: string | null,
    private readonly _subjectPersonId: string,
    private _status: RegistrationStatus,
    private _leagueId: string | null,
    private _divisionId: string | null,
    private _teamId: string | null,
    private _submittedAt: Date | null,
    private _reviewedByUserId: string | null,
    private _reviewedAt: Date | null,
    private _decisionReason: string | null,
    private _metadata: Record<string, unknown>,
    private _items: RegistrationItem[],
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: RegistrationId;
    idempotencyKey: string;
    orgId: string;
    formVersionId: string;
    submittedByUserId?: string | null;
    subjectPersonId: string;
    leagueId?: string | null;
    divisionId?: string | null;
    teamId?: string | null;
    items?: RegistrationItem[];
  }): Registration {
    if (!input.idempotencyKey?.trim()) {
      throw new DomainError(
        "MISSING_IDEMPOTENCY_KEY",
        "Idempotency key required"
      );
    }
    const now = new Date();
    return new Registration(
      input.id,
      input.idempotencyKey,
      input.orgId,
      input.formVersionId,
      input.submittedByUserId ?? null,
      input.subjectPersonId,
      "draft",
      input.leagueId ?? null,
      input.divisionId ?? null,
      input.teamId ?? null,
      null,
      null,
      null,
      null,
      {},
      input.items ?? [],
      now,
      now
    );
  }

  static rehydrate(s: RegistrationSnapshot): Registration {
    return new Registration(
      RegistrationId.of(s.id),
      s.idempotencyKey,
      s.orgId,
      s.formVersionId,
      s.submittedByUserId,
      s.subjectPersonId,
      assertRegistrationStatus(s.status),
      s.leagueId,
      s.divisionId,
      s.teamId,
      s.submittedAt,
      s.reviewedByUserId,
      s.reviewedAt,
      s.decisionReason,
      s.metadata,
      s.items,
      s.createdAt,
      s.updatedAt
    );
  }

  // ---------- behavior ----------

  setItems(items: RegistrationItem[]): void {
    if (this._status !== "draft") {
      throw new DomainError(
        "REG_NOT_DRAFT",
        "Items can only be modified while draft"
      );
    }
    this._items = items;
    this._touch();
  }

  submit(): void {
    if (this._status !== "draft") {
      throw new DomainError(
        "REG_NOT_DRAFT",
        "Can only submit a draft registration"
      );
    }
    this._status = "submitted";
    this._submittedAt = new Date();
    this._touch();
  }

  startReview(reviewerId: string): void {
    if (!canTransitionRegistration(this._status, "under_review")) {
      throw new DomainError(
        "INVALID_REG_TRANSITION",
        `Cannot start review from ${this._status}`
      );
    }
    this._status = "under_review";
    this._reviewedByUserId = reviewerId;
    this._touch();
  }

  approve(reviewerId: string, reason?: string): void {
    if (!canTransitionRegistration(this._status, "approved")) {
      throw new DomainError(
        "INVALID_REG_TRANSITION",
        `Cannot approve from ${this._status}`
      );
    }
    this._status = "approved";
    this._reviewedByUserId = reviewerId;
    this._reviewedAt = new Date();
    this._decisionReason = reason ?? null;
    this._touch();
  }

  reject(reviewerId: string, reason: string): void {
    if (!canTransitionRegistration(this._status, "rejected")) {
      throw new DomainError(
        "INVALID_REG_TRANSITION",
        `Cannot reject from ${this._status}`
      );
    }
    if (!reason?.trim()) {
      throw new DomainError("REJECT_REASON_REQUIRED", "Reason required");
    }
    this._status = "rejected";
    this._reviewedByUserId = reviewerId;
    this._reviewedAt = new Date();
    this._decisionReason = reason;
    this._touch();
  }

  waitlist(reviewerId: string, reason?: string): void {
    if (!canTransitionRegistration(this._status, "waitlisted")) {
      throw new DomainError(
        "INVALID_REG_TRANSITION",
        `Cannot waitlist from ${this._status}`
      );
    }
    this._status = "waitlisted";
    this._reviewedByUserId = reviewerId;
    this._reviewedAt = new Date();
    this._decisionReason = reason ?? null;
    this._touch();
  }

  withdraw(reason?: string): void {
    if (!canTransitionRegistration(this._status, "withdrawn")) {
      throw new DomainError(
        "INVALID_REG_TRANSITION",
        `Cannot withdraw from ${this._status}`
      );
    }
    this._status = "withdrawn";
    this._decisionReason = reason ?? null;
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  // ---------- accessors ----------

  get idempotencyKey(): string { return this._idempotencyKey; }
  get orgId(): string { return this._orgId; }
  get formVersionId(): string { return this._formVersionId; }
  get submittedByUserId(): string | null { return this._submittedByUserId; }
  get subjectPersonId(): string { return this._subjectPersonId; }
  get status(): RegistrationStatus { return this._status; }
  get leagueId(): string | null { return this._leagueId; }
  get divisionId(): string | null { return this._divisionId; }
  get teamId(): string | null { return this._teamId; }
  get submittedAt(): Date | null { return this._submittedAt; }
  get reviewedByUserId(): string | null { return this._reviewedByUserId; }
  get reviewedAt(): Date | null { return this._reviewedAt; }
  get decisionReason(): string | null { return this._decisionReason; }
  get metadata(): Record<string, unknown> { return this._metadata; }
  get items(): RegistrationItem[] { return this._items; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): RegistrationSnapshot {
    return {
      id: this.id.value,
      idempotencyKey: this._idempotencyKey,
      orgId: this._orgId,
      formVersionId: this._formVersionId,
      submittedByUserId: this._submittedByUserId,
      subjectPersonId: this._subjectPersonId,
      status: this._status,
      leagueId: this._leagueId,
      divisionId: this._divisionId,
      teamId: this._teamId,
      submittedAt: this._submittedAt,
      reviewedByUserId: this._reviewedByUserId,
      reviewedAt: this._reviewedAt,
      decisionReason: this._decisionReason,
      metadata: this._metadata,
      items: this._items,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
