import { Badge } from "@sportspulse/ui";
import type { NotificationStatus } from "@/lib/api/types";

/** Provider acceptance is different from confirmed mailbox delivery. */
export function NotificationStatusBadge({
  status, channel, deliveryStatus
}: {
  status: NotificationStatus;
  channel?: string;
  deliveryStatus?: string | null;
}) {
  if (channel === "email" && (deliveryStatus || status === "sent")) {
    const labels: Record<string, string> = { accepted: "Provider accepted", delayed: "Delivery delayed", delivered: "Delivered",
      bounced: "Bounced", complained: "Spam complaint", failed: "Delivery failed", suppressed: "Provider suppressed" };
    const state = deliveryStatus ?? "unconfirmed";
    return <Badge tone={state === "delivered" ? "success" : ["bounced", "complained", "failed"].includes(state) ? "danger" : "neutral"}>{labels[state] ?? "Delivery unconfirmed"}</Badge>;
  }
  return <Badge status={status} domain="notification" />;
}
