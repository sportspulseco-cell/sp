/* Hallmark · page: list (communications) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Mail,
  MailMinus,
  RadioTower,
  Send
} from "lucide-react";
import {
  Badge,
  EmptyState,
  SectionRail,
  StatTile,
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
    <div className="space-y-12">
      <PageHeader
        eyebrow="Communications"
        title="Notification outbox"
        description="Every notification the platform has queued for this org. Compose ad-hoc broadcasts to your audience here too."
        action={
          <Link
            href="/communications/compose"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg transition-colors duration-fast ease-ease hover:bg-[var(--accent-hover)]"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} />
            Compose
          </Link>
        }
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Delivery"
          subtitle="Where every queued notification is in its delivery lifecycle. Failed entries surface here for retry / inspection."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile
            icon={Clock}
            label="Queued"
            value={String(counts.queued ?? 0)}
            tone="amber"
          />
          <StatTile
            icon={RadioTower}
            label="Sending"
            value={String(counts.sending ?? 0)}
            tone="blue"
          />
          <StatTile
            icon={CheckCircle2}
            label="Sent"
            value={String(counts.sent ?? 0)}
            tone="emerald"
          />
          <StatTile
            icon={AlertOctagon}
            label="Failed"
            value={String(counts.failed ?? 0)}
            tone="rose"
          />
          <StatTile
            icon={MailMinus}
            label="Suppressed"
            value={String(counts.suppressed ?? 0)}
            tone="neutral"
          />
        </div>
      </section>

      <section className="space-y-6">
        <SectionRail
          index="02"
          label="Outbox"
          subtitle="Each row is one notification. Tap a template code to see the rendered body and the audit trail of which event triggered it."
          meta={`${page.items.length} loaded`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Mail}
                title="No notifications yet"
                description="As soon as the platform queues an email or in-app card for this org, it'll show up here."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Template</TH>
                  <TH>Channel</TH>
                  <TH>Recipient</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Created</TH>
                </TR>
              </THead>
              <TBody>
                {page.items.map((n) => {
                  const tone:
                    | "success"
                    | "warning"
                    | "danger"
                    | "info"
                    | "neutral" =
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
                      <TD className="text-right text-[12px] text-fg-muted">
                        {fmt(n.createdAt)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
