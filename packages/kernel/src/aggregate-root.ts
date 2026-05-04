import { Entity } from "./entity";
import type { EntityId } from "./id";
import type { DomainEvent } from "./domain-event";

// Aggregate root — entity that records domain events.
export abstract class AggregateRoot<
  TId extends EntityId<string>
> extends Entity<TId> {
  private _events: DomainEvent[] = [];

  protected raise(event: DomainEvent): void {
    this._events.push(event);
  }

  pullEvents(): DomainEvent[] {
    const out = this._events;
    this._events = [];
    return out;
  }

  get pendingEvents(): ReadonlyArray<DomainEvent> {
    return this._events;
  }
}
