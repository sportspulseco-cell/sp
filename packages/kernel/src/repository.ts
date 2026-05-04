import type { AggregateRoot } from "./aggregate-root";
import type { EntityId } from "./id";

// Marker interface for the dependency-inversion repository pattern.
// Domain layer declares abstract repos; infrastructure layer implements them.
export interface Repository<
  TAggregate extends AggregateRoot<TId>,
  TId extends EntityId<string>
> {
  findById(id: TId): Promise<TAggregate | null>;
  save(aggregate: TAggregate): Promise<void>;
}

// A unit of work for write transactions across multiple repositories.
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
