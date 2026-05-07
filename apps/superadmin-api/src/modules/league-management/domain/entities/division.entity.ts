import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { DivisionId, SeasonId, AgeGroupId } from "../identifiers";

export type GenderEligibility = "male" | "female" | "mixed" | "open";
export type DivisionStatus = "active" | "archived";

export interface DivisionSnapshot {
  id: string;
  seasonId: string;
  ageGroupId: string | null;
  name: string;
  tier: string | null;
  genderEligibility: GenderEligibility;
  ruleSetOverrides: Record<string, unknown>;
  maxTeams: number | null;
  playoffConfig: Record<string, unknown>;
  status: DivisionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Division extends AggregateRoot<DivisionId> {
  private constructor(
    id: DivisionId,
    private readonly _seasonId: SeasonId,
    private _ageGroupId: AgeGroupId | null,
    private _name: string,
    private _tier: string | null,
    private _genderEligibility: GenderEligibility,
    private _ruleSetOverrides: Record<string, unknown>,
    private _maxTeams: number | null,
    private _playoffConfig: Record<string, unknown>,
    private _status: DivisionStatus,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: DivisionId;
    seasonId: SeasonId;
    name: string;
    tier?: string | null;
    ageGroupId?: AgeGroupId | null;
    genderEligibility?: GenderEligibility;
    maxTeams?: number | null;
  }): Division {
    if (!input.name?.trim()) {
      throw new DomainError("INVALID_DIVISION_NAME", "Required");
    }
    const now = new Date();
    return new Division(
      input.id,
      input.seasonId,
      input.ageGroupId ?? null,
      input.name.trim(),
      input.tier ?? null,
      input.genderEligibility ?? "open",
      {},
      input.maxTeams ?? null,
      {},
      "active",
      now,
      now
    );
  }

  static rehydrate(s: DivisionSnapshot): Division {
    return new Division(
      DivisionId.of(s.id),
      SeasonId.of(s.seasonId),
      s.ageGroupId ? AgeGroupId.of(s.ageGroupId) : null,
      s.name,
      s.tier,
      s.genderEligibility,
      s.ruleSetOverrides,
      s.maxTeams,
      s.playoffConfig,
      s.status,
      s.createdAt,
      s.updatedAt
    );
  }

  rename(name: string): void {
    if (!name?.trim()) throw new DomainError("INVALID_DIVISION_NAME", "Required");
    this._name = name.trim();
    this._touch();
  }

  setTier(tier: string | null): void {
    this._tier = tier;
    this._touch();
  }

  setAgeGroup(id: AgeGroupId | null): void {
    this._ageGroupId = id;
    this._touch();
  }

  setGenderEligibility(g: GenderEligibility): void {
    this._genderEligibility = g;
    this._touch();
  }

  setMaxTeams(n: number | null): void {
    if (n !== null && n < 2) {
      throw new DomainError("INVALID_MAX_TEAMS", "Must be >= 2");
    }
    this._maxTeams = n;
    this._touch();
  }

  archive(): void {
    this._status = "archived";
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  get seasonId(): SeasonId { return this._seasonId; }
  get ageGroupId(): AgeGroupId | null { return this._ageGroupId; }
  get name(): string { return this._name; }
  get tier(): string | null { return this._tier; }
  get genderEligibility(): GenderEligibility { return this._genderEligibility; }
  get ruleSetOverrides(): Record<string, unknown> { return this._ruleSetOverrides; }
  get maxTeams(): number | null { return this._maxTeams; }
  get playoffConfig(): Record<string, unknown> { return this._playoffConfig; }
  get status(): DivisionStatus { return this._status; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): DivisionSnapshot {
    return {
      id: this.id.value,
      seasonId: this._seasonId.value,
      ageGroupId: this._ageGroupId?.value ?? null,
      name: this._name,
      tier: this._tier,
      genderEligibility: this._genderEligibility,
      ruleSetOverrides: this._ruleSetOverrides,
      maxTeams: this._maxTeams,
      playoffConfig: this._playoffConfig,
      status: this._status,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
