import { Badge } from "@/components/ui/badge";
import type { NotificationStatus } from "@/lib/api/types";

const TONE: Record<
  NotificationStatus,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  queued: "info",
  sending: "warning",
  sent: "success",
  failed: "danger",
  suppressed: "neutral"
};

export function NotificationStatusBadge({
  status
}: {
  status: NotificationStatus;
}) {
  return (
    <Badge tone={TONE[status]} mono>
      {status}
    </Badge>
  );
}
