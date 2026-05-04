// Cursor-based pagination defaults. List endpoints accept these.

export interface PageQuery {
  readonly limit: number;
  readonly cursor?: string;
}

export interface Page<T> {
  readonly items: ReadonlyArray<T>;
  readonly nextCursor: string | null;
  readonly total?: number;
}

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export const clampLimit = (n?: number): number => {
  if (!n) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(n, MAX_LIMIT));
};
