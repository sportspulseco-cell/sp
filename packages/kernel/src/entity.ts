import type { EntityId } from "./id";

// Domain entity — identity-based equality.
export abstract class Entity<TId extends EntityId<string>> {
  protected constructor(public readonly id: TId) {}

  equals(other: Entity<TId>): boolean {
    if (other === this) return true;
    if (!(other instanceof Entity)) return false;
    return this.id.equals(other.id);
  }
}
