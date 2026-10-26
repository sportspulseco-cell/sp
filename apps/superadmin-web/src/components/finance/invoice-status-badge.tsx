import { Badge } from "@sportspulse/ui";
import type { InvoiceStatus } from "@/lib/api/types";

/** Invoice status pill: shared word and colour from the kernel status map. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge status={status} />;
}
