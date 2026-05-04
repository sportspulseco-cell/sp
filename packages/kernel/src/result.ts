// Result<T, E> — explicit success/failure without throwing across layer boundaries.

export type Result<T, E = Error> = OkResult<T> | ErrResult<E>;

export interface OkResult<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ErrResult<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): OkResult<T> => ({ ok: true, value });
export const err = <E>(error: E): ErrResult<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is OkResult<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is ErrResult<E> => !r.ok;
