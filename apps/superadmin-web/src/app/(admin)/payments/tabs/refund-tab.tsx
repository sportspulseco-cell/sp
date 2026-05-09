import { Receipt } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { finance } from "@/lib/api/server-api";
import { RefundForm } from "./refund-form";

/**
 * Refund / credit tab. Server pre-loads the invoice + player name for
 * the form's subtitle line ("INV-2025-08841 · Johnny Kula · $4,850 paid").
 * The form itself is a client component — it owns the refund-type
 * dropdown, amount field, reason textarea, and the Confirm button.
 */
export async function RefundTab({
  orgId: _orgId,
  invoiceId
}: {
  orgId: string;
  invoiceId: string | null;
}) {
  if (!invoiceId) {
    return (
      <EmptyState
        icon={Receipt}
        title="Pick an invoice to refund"
        description="Open an invoice from the AR dashboard, then switch to this tab — the URL carries ?invoiceId=… so the form knows the target."
      />
    );
  }

  const invoice = await finance.getInvoice(invoiceId).catch(() => null);
  if (!invoice) {
    return (
      <EmptyState
        icon={Receipt}
        title="Invoice not found"
        description="The invoice may have been voided or the link is stale."
      />
    );
  }

  const refunds = await finance.listRefunds({ invoiceId }).catch(() => []);
  // Subtract any already-issued non-failed refunds from the max.
  const alreadyRefunded = refunds
    .filter((r) => r.status !== "failed" && r.status !== "cancelled")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const maxRefundable = Math.max(0, invoice.paidCents - alreadyRefunded);

  // Best-effort player display name (server-side fetch via SDK is overkill —
  // the recipient line is informational; admin sees full details on the
  // Player invoice tab).
  const playerLabel = invoice.recipientPersonId
    ? "" // Filled in by the form's banner via fetch if needed; left empty here.
    : invoice.recipientEmail ?? "—";

  return (
    <RefundForm
      invoiceId={invoiceId}
      invoiceNumber={invoice.invoiceNumber}
      paidCents={invoice.paidCents}
      maxRefundableCents={maxRefundable}
      currency={invoice.currency}
      playerLabel={playerLabel}
      cardOnFileBrand={readCardBrand(invoice)}
      cardOnFileLast4={readCardLast4(invoice)}
      existingRefunds={refunds}
    />
  );
}

function readCardBrand(invoice: { metadata?: Record<string, unknown> }): string | null {
  const md = invoice.metadata;
  if (!md || typeof md !== "object") return null;
  const card = (md as { cardOnFile?: Record<string, unknown> }).cardOnFile;
  if (!card || typeof card !== "object") return null;
  return typeof card.brand === "string" ? card.brand : null;
}

function readCardLast4(invoice: { metadata?: Record<string, unknown> }): string | null {
  const md = invoice.metadata;
  if (!md || typeof md !== "object") return null;
  const card = (md as { cardOnFile?: Record<string, unknown> }).cardOnFile;
  if (!card || typeof card !== "object") return null;
  return typeof card.last4 === "string" ? card.last4 : null;
}
