import { AggregateRoot, DomainError, EntityId } from "@sportspulse/kernel";

export class PersonId extends EntityId<"Person"> {
  static of(v: string): PersonId {
    return new PersonId(v);
  }
}

export interface PersonSnapshot {
  id: string;
  userId: string | null;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string | null;
  dobDate: string | null; // ISO date
  genderSelfId: string | null;
  pronouns: string | null;
  countryCode: string | null;
  photoUrl: string | null;
  externalIds: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Person extends AggregateRoot<PersonId> {
  private constructor(
    id: PersonId,
    private _userId: string | null,
    private _legalFirstName: string,
    private _legalLastName: string,
    private _preferredName: string | null,
    private _dobDate: string | null,
    private _genderSelfId: string | null,
    private _pronouns: string | null,
    private _countryCode: string | null,
    private _photoUrl: string | null,
    private _externalIds: Record<string, unknown>,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: PersonId;
    legalFirstName: string;
    legalLastName: string;
    userId?: string | null;
    preferredName?: string | null;
    dobDate?: string | null;
    genderSelfId?: string | null;
    pronouns?: string | null;
    countryCode?: string | null;
    photoUrl?: string | null;
    externalIds?: Record<string, unknown>;
  }): Person {
    if (!input.legalFirstName?.trim() || !input.legalLastName?.trim()) {
      throw new DomainError("INVALID_PERSON_NAME", "Legal first/last names are required");
    }
    const now = new Date();
    return new Person(
      input.id,
      input.userId ?? null,
      input.legalFirstName.trim(),
      input.legalLastName.trim(),
      input.preferredName ?? null,
      input.dobDate ?? null,
      input.genderSelfId ?? null,
      input.pronouns ?? null,
      input.countryCode ?? null,
      input.photoUrl ?? null,
      input.externalIds ?? {},
      now,
      now
    );
  }

  static rehydrate(s: PersonSnapshot): Person {
    return new Person(
      PersonId.of(s.id),
      s.userId,
      s.legalFirstName,
      s.legalLastName,
      s.preferredName,
      s.dobDate,
      s.genderSelfId,
      s.pronouns,
      s.countryCode,
      s.photoUrl,
      s.externalIds,
      s.createdAt,
      s.updatedAt
    );
  }

  rename(legalFirstName?: string, legalLastName?: string, preferredName?: string | null): void {
    if (legalFirstName !== undefined) {
      if (!legalFirstName.trim()) throw new DomainError("INVALID_PERSON_NAME", "Required");
      this._legalFirstName = legalFirstName.trim();
    }
    if (legalLastName !== undefined) {
      if (!legalLastName.trim()) throw new DomainError("INVALID_PERSON_NAME", "Required");
      this._legalLastName = legalLastName.trim();
    }
    if (preferredName !== undefined) this._preferredName = preferredName;
    this._touch();
  }

  setProfile(input: {
    dobDate?: string | null;
    genderSelfId?: string | null;
    pronouns?: string | null;
    countryCode?: string | null;
    photoUrl?: string | null;
  }): void {
    if (input.dobDate !== undefined) this._dobDate = input.dobDate;
    if (input.genderSelfId !== undefined) this._genderSelfId = input.genderSelfId;
    if (input.pronouns !== undefined) this._pronouns = input.pronouns;
    if (input.countryCode !== undefined) this._countryCode = input.countryCode;
    if (input.photoUrl !== undefined) this._photoUrl = input.photoUrl;
    this._touch();
  }

  linkToUser(userId: string): void {
    this._userId = userId;
    this._touch();
  }

  unlinkUser(): void {
    this._userId = null;
    this._touch();
  }

  setExternalIds(ids: Record<string, unknown>): void {
    this._externalIds = ids;
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  get userId(): string | null { return this._userId; }
  get legalFirstName(): string { return this._legalFirstName; }
  get legalLastName(): string { return this._legalLastName; }
  get preferredName(): string | null { return this._preferredName; }
  get dobDate(): string | null { return this._dobDate; }
  get genderSelfId(): string | null { return this._genderSelfId; }
  get pronouns(): string | null { return this._pronouns; }
  get countryCode(): string | null { return this._countryCode; }
  get photoUrl(): string | null { return this._photoUrl; }
  get externalIds(): Record<string, unknown> { return this._externalIds; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  toSnapshot(): PersonSnapshot {
    return {
      id: this.id.value,
      userId: this._userId,
      legalFirstName: this._legalFirstName,
      legalLastName: this._legalLastName,
      preferredName: this._preferredName,
      dobDate: this._dobDate,
      genderSelfId: this._genderSelfId,
      pronouns: this._pronouns,
      countryCode: this._countryCode,
      photoUrl: this._photoUrl,
      externalIds: this._externalIds,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
