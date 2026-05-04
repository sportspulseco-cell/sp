import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { OrgId } from "../identifiers";
import {
  type OrgStatus,
  type OrgType,
  assertOrgStatus,
  assertOrgType
} from "../value-objects/org-status.vo";

export interface OrgSnapshot {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  orgType: OrgType;
  countryCode: string;
  defaultLocale: string;
  defaultCurrency: string;
  defaultTimezone: string;
  status: OrgStatus;
  branding: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Org extends AggregateRoot<OrgId> {
  private constructor(
    id: OrgId,
    private _slug: string,
    private _legalName: string,
    private _displayName: string,
    private readonly _orgType: OrgType,
    private _countryCode: string,
    private _defaultLocale: string,
    private _defaultCurrency: string,
    private _defaultTimezone: string,
    private _status: OrgStatus,
    private _branding: Record<string, unknown>,
    private _metadata: Record<string, unknown>,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: OrgId;
    slug: string;
    legalName: string;
    displayName: string;
    orgType: OrgType;
    countryCode: string;
    defaultLocale: string;
    defaultCurrency: string;
    defaultTimezone?: string;
  }): Org {
    Org.validateSlug(input.slug);
    if (!input.legalName?.trim() || !input.displayName?.trim()) {
      throw new DomainError("INVALID_ORG_NAME", "Names are required");
    }
    const now = new Date();
    return new Org(
      input.id,
      input.slug.trim().toLowerCase(),
      input.legalName.trim(),
      input.displayName.trim(),
      input.orgType,
      input.countryCode,
      input.defaultLocale,
      input.defaultCurrency,
      input.defaultTimezone ?? "UTC",
      "active",
      {},
      {},
      now,
      now
    );
  }

  static rehydrate(s: OrgSnapshot): Org {
    return new Org(
      OrgId.of(s.id),
      s.slug,
      s.legalName,
      s.displayName,
      assertOrgType(s.orgType),
      s.countryCode,
      s.defaultLocale,
      s.defaultCurrency,
      s.defaultTimezone,
      assertOrgStatus(s.status),
      s.branding,
      s.metadata,
      s.createdAt,
      s.updatedAt
    );
  }

  private static validateSlug(slug: string): void {
    if (!/^[a-z0-9-]{2,60}$/.test(slug.toLowerCase().trim())) {
      throw new DomainError(
        "INVALID_ORG_SLUG",
        "Slug must be 2-60 chars, lowercase alphanumeric and hyphens"
      );
    }
  }

  // ---------- behavior ----------

  rename(legalName?: string, displayName?: string): void {
    if (legalName !== undefined) {
      if (!legalName.trim()) throw new DomainError("INVALID_ORG_NAME", "Required");
      this._legalName = legalName.trim();
    }
    if (displayName !== undefined) {
      if (!displayName.trim()) throw new DomainError("INVALID_ORG_NAME", "Required");
      this._displayName = displayName.trim();
    }
    this._touch();
  }

  setLocale(locale: string): void {
    if (!locale) throw new DomainError("INVALID_LOCALE", "Locale required");
    this._defaultLocale = locale;
    this._touch();
  }

  setCurrency(currency: string): void {
    if (!currency || currency.length !== 3) {
      throw new DomainError("INVALID_CURRENCY", "ISO-4217 3-letter code required");
    }
    this._defaultCurrency = currency.toUpperCase();
    this._touch();
  }

  setTimezone(tz: string): void {
    if (!tz) throw new DomainError("INVALID_TIMEZONE", "Timezone required");
    this._defaultTimezone = tz;
    this._touch();
  }

  setCountry(country: string): void {
    if (!country || country.length !== 2) {
      throw new DomainError("INVALID_COUNTRY", "ISO-3166-1 alpha-2 required");
    }
    this._countryCode = country.toUpperCase();
    this._touch();
  }

  setBranding(branding: Record<string, unknown>): void {
    this._branding = branding;
    this._touch();
  }

  suspend(): void {
    if (this._status === "archived") {
      throw new DomainError("ORG_ARCHIVED", "Cannot suspend an archived org");
    }
    this._status = "suspended";
    this._touch();
  }

  reactivate(): void {
    if (this._status === "archived") {
      throw new DomainError("ORG_ARCHIVED", "Cannot reactivate an archived org");
    }
    this._status = "active";
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

  get slug(): string { return this._slug; }
  get legalName(): string { return this._legalName; }
  get displayName(): string { return this._displayName; }
  get orgType(): OrgType { return this._orgType; }
  get countryCode(): string { return this._countryCode; }
  get defaultLocale(): string { return this._defaultLocale; }
  get defaultCurrency(): string { return this._defaultCurrency; }
  get defaultTimezone(): string { return this._defaultTimezone; }
  get status(): OrgStatus { return this._status; }
  get branding(): Record<string, unknown> { return this._branding; }
  get metadata(): Record<string, unknown> { return this._metadata; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): OrgSnapshot {
    return {
      id: this.id.value,
      slug: this._slug,
      legalName: this._legalName,
      displayName: this._displayName,
      orgType: this._orgType,
      countryCode: this._countryCode,
      defaultLocale: this._defaultLocale,
      defaultCurrency: this._defaultCurrency,
      defaultTimezone: this._defaultTimezone,
      status: this._status,
      branding: this._branding,
      metadata: this._metadata,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
