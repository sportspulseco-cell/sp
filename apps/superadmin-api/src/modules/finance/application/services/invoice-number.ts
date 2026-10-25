import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * The next yearly invoice numbers for an org, INV-YYYY-NNNNN: one past
 * the highest number already used this year. Call inside the transaction
 * that writes the invoices; a per-org advisory lock is held until it
 * commits, so two writers never take the same number. Counting the year's
 * invoices (the old way in the bulk composer and the dues split) reused an
 * existing number as soon as any invoice had been deleted, and every later
 * bulk invoice for that org failed on invoice_number_uniq.
 */
export async function reserveInvoiceNumbers(tx: Tx, orgId: string, count = 1): Promise<string[]> {
  const year = new Date().getUTCFullYear();
  const prefix = `INV-${year}-`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`invoice-number:${orgId}`}))`);
  const rows = await tx.execute<{ max: number | null }>(sql`
    SELECT MAX(substring(invoice_number from ${`^${prefix}([0-9]+)$`})::int) AS max
      FROM invoices
     WHERE org_id = ${orgId} AND invoice_number LIKE ${`${prefix}%`}`);
  const start = Number(rows[0]?.max ?? 0) + 1;
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(5, "0")}`);
}
