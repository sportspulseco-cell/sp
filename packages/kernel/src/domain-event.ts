// Domain events — what happened in the past tense, raised by aggregates.

export interface DomainEvent {
  readonly eventId: string; // ULID
  readonly eventType: string; // "iam.user.created"
  readonly occurredAtUtc: Date;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly payload: Record<string, unknown>;
}

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: ReadonlyArray<DomainEvent>): Promise<void>;
}
