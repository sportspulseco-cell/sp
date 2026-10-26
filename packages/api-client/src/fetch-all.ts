import type { Page } from "./types";

/**
 * Follow `nextCursor` until the list is exhausted (or `cap` rows).
 *
 * List endpoints default to 25 rows ordered by id, so a picker that
 * reads one page silently drops rows past the first page (SETUP-14,
 * SCH-20: new teams missing from game and role pickers). Use this for
 * any dropdown that must show every option.
 */
export async function fetchAll<T>(
  page: (cursor?: string) => Promise<Page<T>>,
  cap = 2000
): Promise<Page<T>> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const res = await page(cursor);
    items.push(...res.items);
    cursor = res.nextCursor ?? undefined;
  } while (cursor && items.length < cap);
  return { items, nextCursor: null };
}

/**
 * Map over items with at most `limit` calls in flight. A page that fired
 * one request per org or per season all at once sent 70-160 requests in
 * the same second; each could land on a fresh API instance with its own
 * database pool, and together they ran the pooler out of connections
 * (CONSOLE-22). Results keep the input order.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
