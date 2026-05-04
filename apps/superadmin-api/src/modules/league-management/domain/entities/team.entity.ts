import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { TeamId } from "../identifiers";

export type TeamStatus = "active" | "dissolved";

export interface TeamSnapshot {
  id: string;
  orgId: string;
  name: string;
  shortName: string | null;
  sportCode: string;
  colors: Record<string, unknown>;
  logoUrl: string | null;
  externalIds: Record<string, unknown>;
  status: TeamStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Team extends AggregateRoot<TeamId> {
  private constructor(
    id: TeamId,
    private readonly _orgId: string,
    private _name: string,
    private _shortName: string | null,
    private readonly _sportCode: string,
    private _colors: Record<string, unknown>,
    private _logoUrl: string | null,
    private _externalIds: Record<string, unknown>,
    private _status: TeamStatus,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: TeamId;
    orgId: string;
    name: string;
    sportCode: string;
    shortName?: string | null;
    colors?: Record<string, unknown>;
    logoUrl?: string | null;
  }): Team {
    if (!input.name?.trim()) {
      throw new DomainError("INVALID_TEAM_NAME", "Required");
    }
    const now = new Date();
    return new Team(
      input.id,
      input.orgId,
      input.name.trim(),
      input.shortName ?? null,
      input.sportCode,
      input.colors ?? {},
      input.logoUrl ?? null,
      {},
      "active",
      now,
      now
    );
  }

  static rehydrate(s: TeamSnapshot): Team {
    return new Team(
      TeamId.of(s.id),
      s.orgId,
      s.name,
      s.shortName,
      s.sportCode,
      s.colors,
      s.logoUrl,
      s.externalIds,
      s.status,
      s.createdAt,
      s.updatedAt
    );
  }

  rename(name: string, shortName?: string | null): void {
    if (!name?.trim()) throw new DomainError("INVALID_TEAM_NAME", "Required");
    this._name = name.trim();
    if (shortName !== undefined) this._shortName = shortName;
    this._touch();
  }

  setColors(colors: Record<string, unknown>): void {
    this._colors = colors;
    this._touch();
  }

  setLogo(url: string | null): void {
    this._logoUrl = url;
    this._touch();
  }

  dissolve(): void {
    this._status = "dissolved";
    this._touch();
  }

  reactivate(): void {
    this._status = "active";
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  get orgId(): string { return this._orgId; }
  get name(): string { return this._name; }
  get shortName(): string | null { return this._shortName; }
  get sportCode(): string { return this._sportCode; }
  get colors(): Record<string, unknown> { return this._colors; }
  get logoUrl(): string | null { return this._logoUrl; }
  get externalIds(): Record<string, unknown> { return this._externalIds; }
  get status(): TeamStatus { return this._status; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): TeamSnapshot {
    return {
      id: this.id.value,
      orgId: this._orgId,
      name: this._name,
      shortName: this._shortName,
      sportCode: this._sportCode,
      colors: this._colors,
      logoUrl: this._logoUrl,
      externalIds: this._externalIds,
      status: this._status,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
