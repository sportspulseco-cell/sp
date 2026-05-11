import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { EligibilityRecordId } from "../identifiers";
import {
  type EligibilityStatus,
  assertEligibilityStatus
} from "../value-objects/statuses.vo";

export interface EligibilityRecordSnapshot {
  id: string;
  personId: string;
  seasonId: string | null;
  governingBodyId: string | null;
  ruleEvaluation: Record<string, unknown>;
  status: EligibilityStatus;
  waiverReason: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  evaluatedAt: Date;
  evaluatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EligibilityRecord extends AggregateRoot<EligibilityRecordId> {
  private constructor(
    id: EligibilityRecordId,
    private readonly _personId: string,
    private readonly _seasonId: string | null,
    private readonly _governingBodyId: string | null,
    private _ruleEvaluation: Record<string, unknown>,
    private _status: EligibilityStatus,
    private _waiverReason: string | null,
    private readonly _effectiveFrom: Date,
    private _effectiveTo: Date | null,
    private _evaluatedAt: Date,
    private _evaluatedByUserId: string | null,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: EligibilityRecordId;
    personId: string;
    seasonId?: string | null;
    governingBodyId?: string | null;
    ruleEvaluation?: Record<string, unknown>;
    status?: EligibilityStatus;
    evaluatedByUserId?: string | null;
  }): EligibilityRecord {
    const now = new Date();
    return new EligibilityRecord(
      input.id,
      input.personId,
      input.seasonId ?? null,
      input.governingBodyId ?? null,
      input.ruleEvaluation ?? {},
      input.status ?? "pending",
      null,
      now,
      null,
      now,
      input.evaluatedByUserId ?? null,
      now,
      now
    );
  }

  static rehydrate(s: EligibilityRecordSnapshot): EligibilityRecord {
    return new EligibilityRecord(
      EligibilityRecordId.of(s.id),
      s.personId,
      s.seasonId,
      s.governingBodyId,
      s.ruleEvaluation,
      assertEligibilityStatus(s.status),
      s.waiverReason,
      s.effectiveFrom,
      s.effectiveTo,
      s.evaluatedAt,
      s.evaluatedByUserId,
      s.createdAt,
      s.updatedAt
    );
  }

  setEvaluation(
    evaluation: Record<string, unknown>,
    status: EligibilityStatus,
    evaluatedByUserId?: string | null
  ): void {
    this._ruleEvaluation = evaluation;
    this._status = status;
    this._evaluatedAt = new Date();
    this._evaluatedByUserId = evaluatedByUserId ?? this._evaluatedByUserId;
    this._touch();
  }

  waive(reason: string, byUserId: string, checkType?: string): void {
    if (!reason?.trim()) {
      throw new DomainError("WAIVER_REASON_REQUIRED", "Reason required");
    }
    if (checkType) {
      // Patch ruleEvaluation: mark the specific check as adminWaived.
      const existing =
        (this._ruleEvaluation[checkType] as Record<string, unknown>) ?? {};
      this._ruleEvaluation = {
        ...this._ruleEvaluation,
        [checkType]: {
          ...existing,
          status: existing.status === "blocked" ? "blocked" : "verified",
          adminWaived: true,
          waiveReason: reason,
          waivedByUserId: byUserId,
          waivedAt: new Date().toISOString()
        }
      };
    }
    this._status = "waived";
    this._waiverReason = reason;
    this._evaluatedByUserId = byUserId;
    this._evaluatedAt = new Date();
    this._touch();
  }

  expire(at?: Date): void {
    this._status = "expired";
    this._effectiveTo = at ?? new Date();
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  get personId(): string { return this._personId; }
  get seasonId(): string | null { return this._seasonId; }
  get governingBodyId(): string | null { return this._governingBodyId; }
  get ruleEvaluation(): Record<string, unknown> { return this._ruleEvaluation; }
  get status(): EligibilityStatus { return this._status; }
  get waiverReason(): string | null { return this._waiverReason; }
  get effectiveFrom(): Date { return this._effectiveFrom; }
  get effectiveTo(): Date | null { return this._effectiveTo; }
  get evaluatedAt(): Date { return this._evaluatedAt; }
  get evaluatedByUserId(): string | null { return this._evaluatedByUserId; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): EligibilityRecordSnapshot {
    return {
      id: this.id.value,
      personId: this._personId,
      seasonId: this._seasonId,
      governingBodyId: this._governingBodyId,
      ruleEvaluation: this._ruleEvaluation,
      status: this._status,
      waiverReason: this._waiverReason,
      effectiveFrom: this._effectiveFrom,
      effectiveTo: this._effectiveTo,
      evaluatedAt: this._evaluatedAt,
      evaluatedByUserId: this._evaluatedByUserId,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
