import { MessageSquare, Send, AlertCircle, Inbox } from "lucide-react";
import Link from "next/link";
import { load } from "@sportspulse/api-client";
import { ChannelStatusNotice } from "@sportspulse/admin-pages";
import { LoadError, LocalDate, Eyebrow, EmptyState, IconTile, type Tint, StatNumber, PageHeader, TBody, TD, TH, THead, TR, Table } from "@sportspulse/ui";
import { communications } from "@/lib/api/server-api";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { NotificationStatusBadge } from "@/components/communications/notification-status-badge";
import { FlushQueuedButton, RetryNotificationButton } from "@/components/communications/flush-queued-button";
import type { NotificationStatus } from "@/lib/api/types";

export const metadata = { title: "Communications · Super Admin" };

const STATUS_FILTERS: Array<{ key: NotificationStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "sending", label: "Sending" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "suppressed", label: "Suppressed" }
];

function fmt(iso: string) {
  return <LocalDate iso={iso} format="dateTime" />;
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
  searchParams?: Promise<{ status?: NotificationStatus; cursor?: string }>;
}) {
  const sp = await searchParams;
  const status = sp?.status;

  const [filteredResult, summaryResult, channelStatus] = await Promise.all([
    load(communications.listNotifications({ status, cursor: sp?.cursor, limit: 50 })),
    load(communications.notificationSummary()),
    communications.channelStatus().catch(() => null)
  ]);
  if (!filteredResult.ok) {
    console.error("[communications] listNotifications failed", filteredResult.status, filteredResult.message);
  }
  const filteredPage = filteredResult.ok
    ? filteredResult.data
    : { items: [], nextCursor: null };
  const counts = summaryResult.ok ? summaryResult.data : { queued: 0, sending: 0, sent: 0, failed: 0, suppressed: 0 };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Messages"
        title="Messages"
        description="Everything the platform has sent or queued: registration decisions, game results, announcements. Send a message from here."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/communications/compose"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
              Send an announcement
            </Link>
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

      <ChannelStatusNotice status={channelStatus} />

      {summaryResult.ok ? <KineticStrip
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
            label: "Processed",
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
      /> : <LoadError what="notification totals" status={summaryResult.status} message={summaryResult.message} />}

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

      {!filteredResult.ok ? (
        <LoadError
          what="notifications"
          status={filteredResult.status}
          message={filteredResult.message}
        />
      ) : filteredPage.items.length === 0 ? (
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
                <TD className="text-[12px] text-fg-muted">
                  {n.recipientName ?? n.recipientEmail ?? "Recipient unavailable"}
                </TD>
                <TD className="max-w-md truncate text-fg">
                  {n.subject ?? <span className="text-fg-muted">—</span>}
                </TD>
                <TD className="text-fg-muted">{n.channel}</TD>
                <TD>
                  <NotificationStatusBadge status={n.status} channel={n.channel} deliveryStatus={n.deliveryStatus} />
                  {n.lastError ? (
                    <p className="mt-1 max-w-[280px] truncate font-mono text-[10px] text-rose-600 dark:text-rose-400">
                      {n.lastError}
                    </p>
                  ) : null}
                </TD>
                <TD className="text-right">
                  <span className="block font-mono text-[11px] tabular-nums text-fg">
                    {fmt(n.deliveryUpdatedAt ?? n.sentAt ?? n.createdAt)}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {n.deliveryUpdatedAt ? "delivery update" : n.sentAt ? "processed" : n.status}
                    {n.attemptCount > 0 ? ` · ${n.attemptCount}x` : ""}
                  </span>
                </TD>
                <TD className="text-right">
                  {(n.status === "queued" || n.status === "failed") && n.attemptCount < 3 && Date.parse(n.createdAt) > Date.now() - 86400000 ? (
                    <RetryNotificationButton id={n.id} />
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {filteredPage.nextCursor ? <Link className="inline-flex rounded-md border border-border px-4 py-2 text-sm" href={`/communications?${new URLSearchParams({ ...(status ? { status } : {}), cursor: filteredPage.nextCursor })}`}>Older notifications</Link> : null}
    </div>
  );
}
