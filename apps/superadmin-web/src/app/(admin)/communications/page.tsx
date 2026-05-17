import { MessageSquare, Send, AlertCircle, Inbox } from "lucide-react";
import Link from "next/link";
import { communications } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { StatNumber } from "@/components/ui/stat-number";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { NotificationStatusBadge } from "@/components/communications/notification-status-badge";
import {
  FlushQueuedButton,
  RetryNotificationButton
} from "@/components/communications/flush-queued-button";
import type { NotificationStatus } from "@/lib/api/types";

export const metadata = { title: "Communications — SportsPulse" };

const STATUS_FILTERS: Array<{ key: NotificationStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "sending", label: "Sending" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "suppressed", label: "Suppressed" }
];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function tintForStatus(s: NotificationStatus): Tint {
  switch (s) {
    case "sent":
      return "emerald";
    case "queued":
      return "blue";
    case "sending":
      return "amber";
    case "failed":
      return "rose";
    default:
      return "neutral";
  }
}

export default async function CommunicationsPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: NotificationStatus }>;
}) {
  const sp = await searchParams;
  const status = sp?.status;

  // We pull a wide page so the KPI counts are accurate across statuses on the
  // overview row. With our outbox volumes that's fine; later we'd add a
  // dedicated /counts endpoint.
  const [filteredPage, allPage] = await Promise.all([
    communications
      .listNotifications({ status, limit: 100 })
      .catch(() => ({ items: [], nextCursor: null })),
    status
      ? communications
          .listNotifications({ limit: 200 })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve(null)
  ]);

  const allItems = (allPage ?? filteredPage).items;
  const counts = {
    queued: allItems.filter((n) => n.status === "queued").length,
    sending: allItems.filter((n) => n.status === "sending").length,
    sent: allItems.filter((n) => n.status === "sent").length,
    failed: allItems.filter((n) => n.status === "failed").length
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="outbound"
        title="Communications"
        description="Outbox of every notification queued by the platform — registration decisions, game finalizations, suspensions, and admin sends."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/communications/templates"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
            >
              Templates →
            </Link>
            <FlushQueuedButton count={counts.queued} />
          </div>
        }
      />

      <KineticStrip
        cards={[
          {
            label: "Queued",
            value: counts.queued,
            icon: <Inbox className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: counts.queued > 0 ? "warn" : "idle"
          },
          {
            label: "Sending",
            value: counts.sending,
            icon: <Send className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: counts.sending > 0 ? "live" : "idle"
          },
          {
            label: "Sent",
            value: counts.sent,
            icon: <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "ok"
          },
          {
            label: "Failed",
            value: counts.failed,
            icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: counts.failed > 0 ? "live" : "idle"
          }
        ]}
      />

      {/* Status filter strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "all") === f.key;
          const href =
            f.key === "all"
              ? "/communications"
              : `/communications?status=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={
                active
                  ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                  : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {filteredPage.items.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No notifications"
          description={
            status
              ? `Nothing is currently in the ${status} bucket.`
              : "Trigger an event (approve a registration, finalize a game, issue a suspension) to populate the outbox."
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Template</TH>
              <TH>Recipient</TH>
              <TH>Subject</TH>
              <TH>Channel</TH>
              <TH>Status</TH>
              <TH className="text-right">When</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {filteredPage.items.map((n) => (
              <TR key={n.id}>
                <TD>
                  <span className="font-mono text-[11px] uppercase tracking-wide text-fg">
                    {n.templateCode}
                  </span>
                </TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {n.recipientPersonId
                    ? n.recipientPersonId.slice(0, 8)
                    : (n.recipientEmail ?? "—")}
                </TD>
                <TD className="max-w-md truncate text-fg">
                  {n.subject ?? <span className="text-fg-muted">—</span>}
                </TD>
                <TD className="text-fg-muted">{n.channel}</TD>
                <TD>
                  <NotificationStatusBadge status={n.status} />
                  {n.lastError ? (
                    <p className="mt-1 max-w-[280px] truncate font-mono text-[10px] text-rose-600 dark:text-rose-400">
                      {n.lastError}
                    </p>
                  ) : null}
                </TD>
                <TD className="text-right">
                  <span className="block font-mono text-[11px] tabular-nums text-fg">
                    {n.sentAt ? fmt(n.sentAt) : fmt(n.createdAt)}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {n.sentAt ? "sent" : "queued"}
                    {n.attemptCount > 0 ? ` · ${n.attemptCount}x` : ""}
                  </span>
                </TD>
                <TD className="text-right">
                  {n.status === "queued" || n.status === "failed" ? (
                    <RetryNotificationButton id={n.id} />
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
