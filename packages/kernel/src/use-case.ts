// CQRS-lite — commands mutate, queries read. One handler per use case (SRP).

export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

export interface CommandHandler<TCommand, TResult>
  extends UseCase<TCommand, TResult> {}

export interface QueryHandler<TQuery, TResult>
  extends UseCase<TQuery, TResult> {}
