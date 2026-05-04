// Strongly-typed UUID identifiers per aggregate. Lets the type system catch
// passing a UserId where an OrgId is expected.

export type Brand<T, B> = T & { readonly __brand: B };
export type UUID = string;

export interface IdConstructor<TBrand extends string> {
  new (value: UUID): EntityId<TBrand>;
  create(value: UUID): EntityId<TBrand>;
}

export class EntityId<TBrand extends string> {
  constructor(public readonly value: UUID) {
    if (!EntityId.isValid(value)) {
      throw new Error(`Invalid UUID: ${value}`);
    }
  }
  static isValid(value: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      value
    );
  }
  equals(other: EntityId<TBrand>): boolean {
    return this.value === other.value;
  }
  toString(): string {
    return this.value;
  }
}
