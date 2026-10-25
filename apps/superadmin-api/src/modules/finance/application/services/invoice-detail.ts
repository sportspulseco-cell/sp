import { desc, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

/**
 * One invoice with its lines, payments, installments and refunds. The
 * admin console's invoice page and the org console's (MON-19) read the
 * same bundle; callers check the caller's access first.
 */
export async function loadInvoiceDetail(db: Database, id: string) {
  const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1);
  if (!invoice) return null;
  const [items, payments, installments, refunds] = await Promise.all([
    db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, id)),
    db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.invoiceId, id))
      .orderBy(desc(schema.payments.receivedAt)),
    db
      .select()
      .from(schema.installmentSchedules)
      .where(eq(schema.installmentSchedules.invoiceId, id))
      .orderBy(schema.installmentSchedules.installmentNumber),
    db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.invoiceId, id))
      .orderBy(desc(schema.refunds.createdAt))
  ]);
  return { invoice, items, payments, installments, refunds };
}
