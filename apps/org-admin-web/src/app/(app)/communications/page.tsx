import Link from "next/link";
import { Mail, Send } from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { communications, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Communications · Org Admin" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * Org-scoped notification outbox. Same list endpoint the platform
 * admin sees on /communications, just filtered to the caller's org
 * via the orgId param (the API's notification queries respect
 * scope when the requester isn't a super_admin).
 *
 * P5-D part 2 / built-out alongside org-admin-web's other surfaces.
 */
export default async function CommunicationsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await communications
        .listNotifications({ orgId, limit: 100 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const counts = page.items.reduce(
    (acc, n) => {
      acc[n.status as keyof typeof acc] =
        (acc[n.status as keyof typeof acc] ?? 0) + 1;
      return acc;
    },
    {
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      suppressed: 0
    } as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Communications"
        title="Notification outbox"
        description="Every notification the platform has queued for this org. Compose ad-hoc broadcasts to your audience here too."
        action={
          <Link
            href="/communications/compose"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} />
            Compose
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Queued" value={counts.queued ?? 0} tone="amber" />
        <Stat label="Sending" value={counts.sending ?? 0} tone="blue" />
        <Stat label="Sent" value={counts.sent ?? 0} tone="emerald" />
        <Stat label="Failed" value={counts.failed ?? 0} tone="rose" />
        <Stat label="Suppressed" value={counts.suppressed ?? 0} tone="neutral" />
      </section>

      {page.items.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No notifications yet"
          description="As soon as the platform queues an email or in-app card for this org, it'll show up here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Template</TH>
              <TH>Channel</TH>
              <TH>Recipient</TH>
              <TH>Status</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((n) => {
              const tone: "success" | "warning" | "danger" | "info" | "neutral" =
                n.status === "sent"
                  ? "success"
                  : n.status === "failed"
                    ? "danger"
                    : n.status === "suppressed"
                      ? "neutral"
                      : "warning";
              return (
                <TR key={n.id}>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {n.templateCode}
                  </TD>
                  <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">
                    {n.channel}
                  </TD>
                  <TD className="text-[12px] text-fg">
                    {n.recipientEmail ?? n.recipientPersonId ?? "—"}
                  </TD>
                  <TD>
                    <Badge mono tone={tone}>
                      {n.status}
                    </Badge>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {fmt(n.createdAt)}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "emerald" | "rose" | "neutral";
}) {
  const toneClass: Record<typeof tone, string> = {
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    rose: "text-rose-700 dark:text-rose-300",
    neutral: "text-fg-muted"
  };
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className={`mt-1 text-[22px] font-semibold tracking-tight ${toneClass[tone]}`}>
        {value}
      </p>
    </div>
  );
}
