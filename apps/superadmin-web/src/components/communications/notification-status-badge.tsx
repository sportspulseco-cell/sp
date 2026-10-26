import { Badge } from "@sportspulse/ui";
import type { NotificationStatus } from "@/lib/api/types";

/** Notification status pill: a "sent" notification arrived, so it reads as done. */
export function NotificationStatusBadge({
  status
}: {
  status: NotificationStatus;
}) {
  return <Badge status={status} domain="notification" />;
}
