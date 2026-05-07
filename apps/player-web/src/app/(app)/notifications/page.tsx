import {
  Bell,
  CalendarRange,
  CircleDollarSign,
  ScrollText,
  ShieldAlert,
  type LucideIcon
} from "lucide-react";
import { Badge, EmptyState, IconTile } from "@sportspulse/ui";
import type { Notification } from "@sportspulse/api-client";
import { communications, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Notifications — SportsPulse" };

function fmt(iso: string | null): string {
  if (!iso) return "queued";
  const diff = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function iconFor(code: string): LucideIcon {
  if (code.includes("payment") || code.includes("invoice")) return CircleDollarSign;
  if (code.includes("game") || code.includes("schedule")) return CalendarRange;
  if (code.includes("comply") || code.includes("waiver")) return ShieldAlert;
  if (code.includes("registration")) return ScrollText;
  return Bell;
}

function tintFor(
  code: string
): "blue" | "violet" | "amber" | "rose" | "emerald" | "cyan" | "neutral" {
  if (code.includes("payment") || code.includes("invoice")) return "amber";
  if (code.includes("game") || code.includes("schedule")) return "blue";
  if (code.includes("comply") || code.includes("waiver")) return "rose";
  if (code.includes("registration")) return "violet";
  return "neutral";
}

export default async function NotificationsPage() {
  const scope = await iam.meScope().catch(() => null);
  const personId = scope?.personId ?? null;

  const page = personId
    ? await communications
        .listNotifications({ recipientPersonId: personId, limit: 100 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const notifs: Notification[] = page.items;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Notifications"
        title="Notifications"
        description="Schedule changes, payment reminders, compliance updates, and admin notes."
      />

      {notifs.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="No notifications yet. New schedule, payment, and admin notes will show up here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-1">
          {notifs.map((n: Notification) => (
            <li key={n.id} className="flex items-start gap-3 px-5 py-4">
              <IconTile
                icon={iconFor(n.templateCode)}
                tint={tintFor(n.templateCode)}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium text-fg">
                    {n.subject ?? n.templateCode}
                  </p>
                  <Badge
                    mono
                    tone={
                      n.status === "sent"
                        ? "success"
                        : n.status === "failed"
                          ? "danger"
                          : n.status === "queued"
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {n.status}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-3 text-[12px] text-fg-muted">
                  {n.body}
                </p>
              </div>
              <p className="shrink-0 font-mono text-[10px] text-fg-muted">
                {fmt(n.sentAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
