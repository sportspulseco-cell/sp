import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { UserId } from "../identifiers";
import { Email } from "../value-objects/email.vo";
import {
  type ProfileStatus,
  assertProfileStatus
} from "../value-objects/profile-status.vo";

export interface ProfileSnapshot {
  id: string;
  email: string | null;
  legalFirstName: string | null;
  legalLastName: string | null;
  preferredName: string | null;
  displayName: string | null;
  countryCode: string | null;
  locale: string;
  timezone: string;
  status: ProfileStatus;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Aggregate root: Profile.
// Encapsulates rules around status transitions, super-admin grants, etc.
export class Profile extends AggregateRoot<UserId> {
  private constructor(
    id: UserId,
    private _email: Email | null,
    private _legalFirstName: string | null,
    private _legalLastName: string | null,
    private _preferredName: string | null,
    private _displayName: string | null,
    private _countryCode: string | null,
    private _locale: string,
    private _timezone: string,
    private _status: ProfileStatus,
    private _isSuperAdmin: boolean,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static rehydrate(s: ProfileSnapshot): Profile {
    return new Profile(
      UserId.of(s.id),
      s.email ? Email.create(s.email) : null,
      s.legalFirstName,
      s.legalLastName,
      s.preferredName,
      s.displayName,
      s.countryCode,
      s.locale,
      s.timezone,
      assertProfileStatus(s.status),
      s.isSuperAdmin,
      s.createdAt,
      s.updatedAt
    );
  }

  // ---------- behavior ----------

  suspend(): void {
    if (this._status === "deleted") {
      throw new DomainError("PROFILE_DELETED", "Cannot suspend a deleted profile");
    }
    this._status = "suspended";
    this._updatedAt = new Date();
  }

  reactivate(): void {
    if (this._status === "deleted") {
      throw new DomainError("PROFILE_DELETED", "Cannot reactivate a deleted profile");
    }
    this._status = "active";
    this._updatedAt = new Date();
  }

  softDelete(): void {
    this._status = "deleted";
    this._updatedAt = new Date();
  }

  rename(input: {
    legalFirstName?: string | null;
    legalLastName?: string | null;
    preferredName?: string | null;
    displayName?: string | null;
  }): void {
    if (input.legalFirstName !== undefined) this._legalFirstName = input.legalFirstName;
    if (input.legalLastName !== undefined) this._legalLastName = input.legalLastName;
    if (input.preferredName !== undefined) this._preferredName = input.preferredName;
    if (input.displayName !== undefined) this._displayName = input.displayName;
    this._updatedAt = new Date();
  }

  setLocale(locale: string, timezone?: string): void {
    if (!locale) throw new DomainError("INVALID_LOCALE", "Locale required");
    this._locale = locale;
    if (timezone) this._timezone = timezone;
    this._updatedAt = new Date();
  }

  setCountryCode(code: string | null): void {
    if (code !== null && code.length !== 2) {
      throw new DomainError("INVALID_COUNTRY", "Country code must be ISO-3166-1 alpha-2");
    }
    this._countryCode = code === null ? null : code.toUpperCase();
    this._updatedAt = new Date();
  }

  promoteToSuperAdmin(): void {
    this._isSuperAdmin = true;
    this._updatedAt = new Date();
  }

  demoteFromSuperAdmin(): void {
    this._isSuperAdmin = false;
    this._updatedAt = new Date();
  }

  // ---------- accessors ----------

  get email(): string | null { return this._email?.value ?? null; }
  get legalFirstName(): string | null { return this._legalFirstName; }
  get legalLastName(): string | null { return this._legalLastName; }
  get preferredName(): string | null { return this._preferredName; }
  get displayName(): string | null { return this._displayName; }
  get countryCode(): string | null { return this._countryCode; }
  get locale(): string { return this._locale; }
  get timezone(): string { return this._timezone; }
  get status(): ProfileStatus { return this._status; }
  get isSuperAdmin(): boolean { return this._isSuperAdmin; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): ProfileSnapshot {
    return {
      id: this.id.value,
      email: this._email?.value ?? null,
      legalFirstName: this._legalFirstName,
      legalLastName: this._legalLastName,
      preferredName: this._preferredName,
      displayName: this._displayName,
      countryCode: this._countryCode,
      locale: this._locale,
      timezone: this._timezone,
      status: this._status,
      isSuperAdmin: this._isSuperAdmin,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
