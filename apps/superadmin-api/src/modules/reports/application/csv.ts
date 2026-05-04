/**
 * Tiny dependency-free CSV serializer. Quotes any field containing a comma,
 * double-quote, or newline; doubles embedded quotes per RFC 4180.
 */
export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns?: string[]
): string {
  if (rows.length === 0) {
    return columns?.length ? columns.join(",") + "\n" : "";
  }
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines: string[] = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => encodeCell(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

function encodeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return encodeCell(JSON.stringify(v));
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
