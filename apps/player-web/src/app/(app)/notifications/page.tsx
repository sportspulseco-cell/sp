import Link from "next/link";
import { Bell, CheckCheck, Settings as SettingsIcon } from "lucide-react";
import {
  EmptyState,
  Eyebrow
} from "@sportspulse/ui";
import type { Notification } from "@sportspulse/api-client";
import { communications, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationRow } from "./notification-row";
import { MarkAllReadButton } from "./mark-all-read";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Notifications — SportsPulse" };

export default async function NotificationsPage() {
  const scope = await iam.meScope().catch(() => null);
  const personId = scope?.personId ?? null;

  const page = personId
    ? await communications
        .listNotifications({ recipientPersonId: personId, limit: 100 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const notifs: Notification[] = page.items;
  const unread = notifs.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Notifications"
        title="Notifications"
        description="Schedule changes, payment reminders, compliance updates, and admin notes. Click a notification to mark it read."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/notifications/settings"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
            >
              <SettingsIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
              Settings
            </Link>
            {unread > 0 ? <MarkAllReadButton unreadCount={unread} /> : null}
          </div>
        }
      />

      {notifs.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="No notifications yet. New schedule, payment, and admin notes will show up here."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          {unread > 0 ? (
            <div className="flex items-center gap-2 border-b border-border bg-blue-500/5 px-5 py-2.5 text-[12px] text-blue-700 dark:text-blue-300">
              <Bell className="h-3.5 w-3.5" strokeWidth={2} />
              <span>
                {unread} unread notification{unread === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-b border-border bg-emerald-500/5 px-5 py-2.5 text-[12px] text-emerald-700 dark:text-emerald-300">
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />
              <span>All read.</span>
            </div>
          )}
          <ul className="divide-y divide-border">
            {notifs.map((n) => (
              <NotificationRow key={n.id} notif={n} />
            ))}
          </ul>
        </div>
      )}

      <div className="hidden">
        <Eyebrow>nb.</Eyebrow>
      </div>
    </div>
  );
}
