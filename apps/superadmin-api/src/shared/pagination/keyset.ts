import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * Keyset paging for lists sorted by something other than `id`. The cursor
 * carries the sort value and the id of the last row ("<value>|<id>"); the
 * next page starts strictly after that pair in the same order. Paging by
 * `id > cursor` while sorting by another column skipped and repeated rows
 * once a list passed one page (users' Type showed "—" for older admins).
 */

export type KeysetDir = "asc" | "desc";

export function encodeCursor(sortValue: Date | string | number, id: string): string {
  const v = sortValue instanceof Date ? sortValue.toISOString() : String(sortValue);
  return `${v}|${id}`;
}

export function decodeCursor(cursor: string): { value: string; id: string } | null {
  const i = cursor.lastIndexOf("|");
  if (i <= 0) return null;
  return { value: cursor.slice(0, i), id: cursor.slice(i + 1) };
}

// Timestamps are compared at millisecond precision: the cursor goes
// through a JS Date (ms), while Postgres keeps microseconds. Without the
// truncation, rows written in one statement (bulk team invoices share a
// created_at) fell between pages.
function sortExpr(sortCol: AnyColumn, sortType: "timestamptz" | "text"): SQL {
  return sortType === "timestamptz" ? sql`date_trunc('milliseconds', ${sortCol})` : sql`${sortCol}`;
}

/** ORDER BY for keyset paging; must be used with afterCursor on the same columns. */
export function keysetOrder(
  sortCol: AnyColumn,
  idCol: AnyColumn,
  dir: KeysetDir,
  sortType: "timestamptz" | "text" = "timestamptz"
): SQL[] {
  const e = sortExpr(sortCol, sortType);
  return dir === "asc" ? [sql`${e} asc`, sql`${idCol} asc`] : [sql`${e} desc`, sql`${idCol} desc`];
}

/**
 * Condition for "rows after the cursor" in keysetOrder's order. A plain id
 * (a cursor issued before this change) falls back to `id > cursor`, so a
 * request in flight across a deploy cannot loop.
 */
export function afterCursor(
  sortCol: AnyColumn,
  idCol: AnyColumn,
  cursor: string,
  dir: KeysetDir,
  sortType: "timestamptz" | "text" = "timestamptz"
): SQL {
  const c = decodeCursor(cursor);
  if (!c) return sql`${idCol} > ${cursor}::uuid`;
  const e = sortExpr(sortCol, sortType);
  const value = sortType === "timestamptz" ? sql`${c.value}::timestamptz` : sql`${c.value}::text`;
  return dir === "asc"
    ? sql`(${e}, ${idCol}) > (${value}, ${c.id}::uuid)`
    : sql`(${e}, ${idCol}) < (${value}, ${c.id}::uuid)`;
}
