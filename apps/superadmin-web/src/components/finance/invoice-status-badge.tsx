import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/api/types";

const TONE: Record<
  InvoiceStatus,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  partial: "warning",
  overdue: "danger",
  void: "neutral"
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge tone={TONE[status]} mono>
      {status}
    </Badge>
  );
}
