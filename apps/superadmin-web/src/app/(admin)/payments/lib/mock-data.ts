import type { Invoice, QuickbooksSyncLog, QuickbooksSyncStatus } from "@sportspulse/api-client";

/**
 * Toggle demo fallbacks for surfaces backed by external workers
 * (Stripe webhook, registration-v2 worker, notifications worker, QB
 * OAuth) that haven't shipped yet. See doc/deferred-integrations.md
 * for the full backlog.
 *
 * Default: ON — so stakeholders can walk the flow during reviews.
 * Set NEXT_PUBLIC_PAYMENTS_DEMO=false in production environments
 * once each underlying worker lands.
 */
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_PAYMENTS_DEMO === undefined
    ? true
    : process.env.NEXT_PUBLIC_PAYMENTS_DEMO === "true";

// =====================================================================
// Card on file (Player invoice tab)
// =====================================================================
export interface DemoCardOnFile {
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
}

export function mockCardOnFile(): DemoCardOnFile {
  return { brand: "Visa", last4: "4242", expMonth: 9, expYear: 2027 };
}

// =====================================================================
// Upcoming installments (Player invoice tab)
// =====================================================================
export interface DemoUpcomingEntry {
  label: string;
  dueAt: string;
  amountCents: number;
  status: "upcoming" | "scheduled";
}

/**
 * Synthesise a 2-installment plan from an invoice's outstanding
 * balance. The first installment fires ~30 days from now (or from the
 * invoice's dueAt if set), the second ~30 days after that.
 */
export function mockUpcomingFromInvoice(invoice: Invoice): DemoUpcomingEntry[] {
  const outstanding = invoice.totalCents - invoice.paidCents;
  if (outstanding <= 0) return [];

  const half = Math.floor(outstanding / 2);
  const remainder = outstanding - half * 2;
  const firstAmount = half + remainder; // absorb the cent-rounding
  const secondAmount = half;

  const start = invoice.dueAt
    ? new Date(invoice.dueAt)
    : new Date(Date.now() + 30 * 86_400_000);
  const second = new Date(start.getTime() + 30 * 86_400_000);

  return [
    {
      label: "Installment 1",
      dueAt: start.toISOString(),
      amountCents: firstAmount,
      status: "upcoming"
    },
    {
      label: "Installment 2",
      dueAt: second.toISOString(),
      amountCents: secondAmount,
      status: "scheduled"
    }
  ];
}

// =====================================================================
// QuickBooks sync indicator + recent events (Header + Overdue tab)
// =====================================================================
export function mockQbSyncStatus(orgId: string): QuickbooksSyncStatus {
  const now = new Date();
  const ago = (mins: number) =>
    new Date(now.getTime() - mins * 60_000).toISOString();
  const events: QuickbooksSyncLog[] = [
    {
      id: "demo-1",
      orgId,
      entityType: "payment",
      entityId: "demo-payment-1",
      qbId: "QBP-50421",
      action: "create",
      status: "succeeded",
      summary: "Payment confirmed · INV-2025-08841 · $1,000 · QB Payment created",
      errorMessage: null,
      attemptedAt: ago(2),
      createdAt: ago(2)
    },
    {
      id: "demo-2",
      orgId,
      entityType: "invoice",
      entityId: "demo-invoice-1",
      qbId: "QBI-50420",
      action: "update",
      status: "succeeded",
      summary: "Late fee applied · INV-2025-09012 · $25 · QB Invoice updated",
      errorMessage: null,
      attemptedAt: ago(11),
      createdAt: ago(11)
    },
    {
      id: "demo-3",
      orgId,
      entityType: "credit_memo",
      entityId: "demo-credit-1",
      qbId: "QBC-50419",
      action: "create",
      status: "succeeded",
      summary: "Refund issued · INV-2025-08102 · $485 · QB Credit Memo created",
      errorMessage: null,
      attemptedAt: ago(34),
      createdAt: ago(34)
    }
  ];
  return {
    connected: true,
    lastSyncAt: ago(2),
    errorCount24h: 0,
    recentEvents: events
  };
}

// =====================================================================
// "Cover outstanding" demo flow (Dues split tab)
// =====================================================================
export function mockCoverOutstandingPreview(
  splits: Array<{ allocatedCents: number; collectedCents: number; status: string }>
): { coveredCents: number; players: number } {
  const unpaid = splits.filter((s) => s.status !== "paid");
  const coveredCents = unpaid.reduce(
    (sum, s) => sum + (s.allocatedCents - s.collectedCents),
    0
  );
  return { coveredCents, players: unpaid.length };
}
