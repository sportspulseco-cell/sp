import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { LeagueId, SeasonId, GoverningBodyId, RuleSetId } from "../identifiers";
import {
  type LeagueStatus,
  type LeagueFormat,
  assertLeagueStatus,
  assertLeagueFormat
} from "../value-objects/league-status.vo";

export interface LeagueSnapshot {
  id: string;
  seasonId: string;
  sportCode: string;
  governingBodyId: string | null;
  ruleSetId: string | null;
  name: string;
  format: LeagueFormat;
  status: LeagueStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Aggregate root: League. Lives under a Season; rule-set is locked once
// registration opens.
export class League extends AggregateRoot<LeagueId> {
  private constructor(
    id: LeagueId,
    private readonly _seasonId: SeasonId,
    private readonly _sportCode: string,
    private _governingBodyId: GoverningBodyId | null,
    private _ruleSetId: RuleSetId | null,
    private _name: string,
    private _format: LeagueFormat,
    private _status: LeagueStatus,
    private _metadata: Record<string, unknown>,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: LeagueId;
    seasonId: SeasonId;
    sportCode: string;
    name: string;
    format?: LeagueFormat;
    governingBodyId?: GoverningBodyId | null;
    ruleSetId?: RuleSetId | null;
  }): League {
    if (!input.name?.trim()) {
      throw new DomainError("INVALID_LEAGUE_NAME", "League name required");
    }
    const now = new Date();
    return new League(
      input.id,
      input.seasonId,
      input.sportCode,
      input.governingBodyId ?? null,
      input.ruleSetId ?? null,
      input.name.trim(),
      input.format ?? "regular",
      "draft",
      {},
      now,
      now
    );
  }

  static rehydrate(s: LeagueSnapshot): League {
    return new League(
      LeagueId.of(s.id),
      SeasonId.of(s.seasonId),
      s.sportCode,
      s.governingBodyId ? GoverningBodyId.of(s.governingBodyId) : null,
      s.ruleSetId ? RuleSetId.of(s.ruleSetId) : null,
      s.name,
      assertLeagueFormat(s.format),
      assertLeagueStatus(s.status),
      s.metadata,
      s.createdAt,
      s.updatedAt
    );
  }

  rename(name: string): void {
    if (!name?.trim()) throw new DomainError("INVALID_LEAGUE_NAME", "Required");
    this._name = name.trim();
    this._touch();
  }

  setRuleSet(ruleSetId: RuleSetId | null): void {
    if (this._status !== "draft") {
      throw new DomainError(
        "RULESET_LOCKED",
        "Rule-set can only be changed while league is in draft"
      );
    }
    this._ruleSetId = ruleSetId;
    this._touch();
  }

  setGoverningBody(id: GoverningBodyId | null): void {
    this._governingBodyId = id;
    this._touch();
  }

  changeFormat(format: LeagueFormat): void {
    if (this._status !== "draft") {
      throw new DomainError(
        "FORMAT_LOCKED",
        "Format can only change in draft"
      );
    }
    this._format = format;
    this._touch();
  }

  changeStatus(next: LeagueStatus): void {
    this._status = next;
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  get seasonId(): SeasonId { return this._seasonId; }
  get sportCode(): string { return this._sportCode; }
  get governingBodyId(): GoverningBodyId | null { return this._governingBodyId; }
  get ruleSetId(): RuleSetId | null { return this._ruleSetId; }
  get name(): string { return this._name; }
  get format(): LeagueFormat { return this._format; }
  get status(): LeagueStatus { return this._status; }
  get metadata(): Record<string, unknown> { return this._metadata; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): LeagueSnapshot {
    return {
      id: this.id.value,
      seasonId: this._seasonId.value,
      sportCode: this._sportCode,
      governingBodyId: this._governingBodyId?.value ?? null,
      ruleSetId: this._ruleSetId?.value ?? null,
      name: this._name,
      format: this._format,
      status: this._status,
      metadata: this._metadata,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
