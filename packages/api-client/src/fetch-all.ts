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
