import { Logger } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { coveredInstallments } from "@sportspulse/kernel";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const log = new Logger("Installments");

/**
 * Marks a payment plan's open installments paid once the invoice's paid
 * amount covers them, earliest first (MON-27). Call after every write
 * that raises an invoice's paid_cents (the payer paying by hand, a
 * captain covering the team), in the same transaction. Without it the
 * plan kept showing paid money as due, and the card job could charge an
 * installment the payer had already paid. Returns the rows marked.
 */
export async function settleInstallments(tx: Tx | Database, invoiceId: string): Promise<number> {
  const [inv] = await tx
    .select({ paidCents: schema.invoices.paidCents })
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);
  if (!inv) return 0;
  const rows = await tx
    .select({
      id: schema.installmentSchedules.id,
      installmentNumber: schema.installmentSchedules.installmentNumber,
      amountCents: schema.installmentSchedules.amountCents,
      status: schema.installmentSchedules.status
    })
    .from(schema.installmentSchedules)
    .where(eq(schema.installmentSchedules.invoiceId, invoiceId));
  const covered = coveredInstallments(rows, inv.paidCents);
  if (covered.length === 0) return 0;
  const now = new Date();
  const marked = await tx
    .update(schema.installmentSchedules)
    .set({ status: "succeeded", paidAt: now, lastErrorMessage: null, updatedAt: now })
    .where(
      and(
        inArray(schema.installmentSchedules.id, covered.map((r) => r.id)),
        inArray(schema.installmentSchedules.status, ["scheduled", "failed"])
      )
    )
    .returning({ id: schema.installmentSchedules.id });
  log.log(`settled invoice=${invoiceId} paid=${inv.paidCents} installments=${marked.length}`);
  return marked.length;
}
