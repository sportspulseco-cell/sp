import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { SeasonId } from "../identifiers";
import {
  type SeasonStatus,
  assertSeasonStatus,
  canTransitionSeason
} from "../value-objects/season-status.vo";

export interface SeasonSnapshot {
  id: string;
  /** Post 2026-05-09 — seasons live under a league. */
  leagueId: string;
  /** Denormalised, matches league.orgId. */
  orgId: string;
  name: string;
  sportCode: string;
  startDate: string; // ISO date
  endDate: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  rosterLockAt: Date | null;
  timezone: string;
  status: SeasonStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
}

// Aggregate root: Season.
// Owns lifecycle (status transitions) and validation (date ranges).
export class Season extends AggregateRoot<SeasonId> {
  private constructor(
    id: SeasonId,
    private readonly _leagueId: string,
    private readonly _orgId: string,
    private _name: string,
    private readonly _sportCode: string,
    private _startDate: string,
    private _endDate: string,
    private _registrationOpensAt: Date | null,
    private _registrationClosesAt: Date | null,
    private _rosterLockAt: Date | null,
    private _timezone: string,
    private _status: SeasonStatus,
    private _metadata: Record<string, unknown>,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private readonly _createdByUserId: string | null
  ) {
    super(id);
  }

  static create(input: {
    id: SeasonId;
    leagueId: string;
    orgId: string;
    name: string;
    sportCode: string;
    startDate: string;
    endDate: string;
    timezone?: string;
    createdByUserId?: string | null;
  }): Season {
    if (!input.name?.trim()) {
      throw new DomainError("INVALID_SEASON_NAME", "Season name is required");
    }
    if (input.endDate < input.startDate) {
      throw new DomainError(
        "INVALID_SEASON_DATES",
        "End date must be on or after start date"
      );
    }
    const now = new Date();
    return new Season(
      input.id,
      input.leagueId,
      input.orgId,
      input.name.trim(),
      input.sportCode,
      input.startDate,
      input.endDate,
      null,
      null,
      null,
      input.timezone ?? "UTC",
      "draft",
      {},
      now,
      now,
      input.createdByUserId ?? null
    );
  }

  static rehydrate(s: SeasonSnapshot): Season {
    return new Season(
      SeasonId.of(s.id),
      s.leagueId,
      s.orgId,
      s.name,
      s.sportCode,
      s.startDate,
      s.endDate,
      s.registrationOpensAt,
      s.registrationClosesAt,
      s.rosterLockAt,
      s.timezone,
      assertSeasonStatus(s.status),
      s.metadata,
      s.createdAt,
      s.updatedAt,
      s.createdByUserId
    );
  }

  // ---------- behavior ----------

  rename(name: string): void {
    if (!name?.trim()) throw new DomainError("INVALID_SEASON_NAME", "Required");
    this._name = name.trim();
    this._touch();
  }

  reschedule(startDate: string, endDate: string): void {
    if (endDate < startDate) {
      throw new DomainError(
        "INVALID_SEASON_DATES",
        "End date must be on or after start date"
      );
    }
    this._startDate = startDate;
    this._endDate = endDate;
    this._touch();
  }

  setRegistrationWindow(opensAt: Date | null, closesAt: Date | null): void {
    if (opensAt && closesAt && closesAt < opensAt) {
      throw new DomainError(
        "INVALID_REG_WINDOW",
        "Registration close must be after open"
      );
    }
    this._registrationOpensAt = opensAt;
    this._registrationClosesAt = closesAt;
    this._touch();
  }

  setRosterLock(at: Date | null): void {
    this._rosterLockAt = at;
    this._touch();
  }

  setTimezone(tz: string): void {
    if (!tz) throw new DomainError("INVALID_TIMEZONE", "Timezone required");
    this._timezone = tz;
    this._touch();
  }

  changeStatus(next: SeasonStatus): void {
    if (!canTransitionSeason(this._status, next)) {
      throw new DomainError(
        "INVALID_STATUS_TRANSITION",
        `Cannot transition from ${this._status} to ${next}`
      );
    }
    this._status = next;
    this._touch();
  }

  archive(): void {
    this._status = "archived";
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  // ---------- accessors ----------

  get leagueId(): string { return this._leagueId; }
  get orgId(): string { return this._orgId; }
  get name(): string { return this._name; }
  get sportCode(): string { return this._sportCode; }
  get startDate(): string { return this._startDate; }
  get endDate(): string { return this._endDate; }
  get registrationOpensAt(): Date | null { return this._registrationOpensAt; }
  get registrationClosesAt(): Date | null { return this._registrationClosesAt; }
  get rosterLockAt(): Date | null { return this._rosterLockAt; }
  get timezone(): string { return this._timezone; }
  get status(): SeasonStatus { return this._status; }
  get metadata(): Record<string, unknown> { return this._metadata; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get createdByUserId(): string | null { return this._createdByUserId; }

  toSnapshot(): SeasonSnapshot {
    return {
      id: this.id.value,
      leagueId: this._leagueId,
      orgId: this._orgId,
      name: this._name,
      sportCode: this._sportCode,
      startDate: this._startDate,
      endDate: this._endDate,
      registrationOpensAt: this._registrationOpensAt,
      registrationClosesAt: this._registrationClosesAt,
      rosterLockAt: this._rosterLockAt,
      timezone: this._timezone,
      status: this._status,
      metadata: this._metadata,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      createdByUserId: this._createdByUserId
    };
  }
}
