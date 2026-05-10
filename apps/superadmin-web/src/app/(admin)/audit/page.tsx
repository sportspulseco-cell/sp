import { ScrollText, Activity, Layers, Users } from "lucide-react";
import Link from "next/link";
import { audit } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { MarqueeRail } from "@/components/motion/kinetic";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata = { title: "Audit — SportsPulse" };

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function dotColorFor(action: string) {
  if (action.startsWith("registration.")) return "bg-violet-500";
  if (action.startsWith("game.")) return "bg-emerald-500";
  if (action.startsWith("suspension.")) return "bg-rose-500";
  if (action.startsWith("roster.")) return "bg-blue-500";
  if (action.includes(".created")) return "bg-emerald-500";
  if (action.includes(".updated")) return "bg-amber-500";
  if (action.includes(".deleted") || action.includes(".rejected"))
    return "bg-rose-500";
  if (action.includes(".approved") || action.includes(".published"))
    return "bg-emerald-500";
  return "bg-fg-muted";
}

export default async function AuditPage({
  searchParams
}: {
  searchParams?: Promise<{
    resourceType?: string;
    action?: string;
  }>;
}) {
  const sp = await searchParams;

  const [page, facets] = await Promise.all([
    audit
      .list({
        resourceType: sp?.resourceType,
        action: sp?.action,
        limit: 100
      })
      .catch(() => ({ items: [], nextCursor: null })),
    audit.facets().catch(() => ({ actions: [], resourceTypes: [] }))
  ]);

  const total = page.items.length;
  const distinctActors = new Set(
    page.items.map((e) => e.actorUserId).filter(Boolean)
  ).size;
  const last24h = page.items.filter(
    (e) => Date.now() - new Date(e.tsUtc).getTime() < 24 * 3600 * 1000
  ).length;
  const distinctResources = new Set(page.items.map((e) => e.resourceType)).size;

  // Recent events for the marquee rail
  const marqueeItems = page.items.slice(0, 12).map((e) => ({
    key: e.id,
    node: (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono">{e.action}</span>
        <span className="text-fg-subtle">·</span>
        <span>{e.resourceType}</span>
        {e.resourceId ? (
          <>
            <span className="text-fg-subtle">·</span>
            <span className="font-mono">{e.resourceId.slice(0, 8)}</span>
          </>
        ) : null}
      </span>
    )
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="trail"
        title="Audit"
        description="Append-only ledger of every state change on the platform — actor, resource, before/after, IP, and request id."
      />
      <KineticStrip
        cards={[
          { label: "Recent events", value: total, icon: ScrollText, tone: "idle" },
          {
            label: "Last 24h",
            value: last24h,
            icon: Activity,
            tone: last24h > 0 ? "live" : "idle"
          },
          {
            label: "Distinct actors",
            value: distinctActors,
            icon: Users,
            tone: "info"
          },
          {
            label: "Resource types",
            value: distinctResources,
            icon: Layers,
            tone: "idle"
          }
        ]}
      />

      {marqueeItems.length > 0 ? (
        <MarqueeRail items={marqueeItems} className="-mx-2 rounded-xl" />
      ) : null}

      {/* Facet filters */}
      <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Filter by resource type</Eyebrow>
          {sp?.resourceType || sp?.action ? (
            <Link
              href="/audit"
              className="text-[12px] font-medium text-fg-muted hover:text-fg"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={
              sp?.action ? `/audit?action=${encodeURIComponent(sp.action)}` : "/audit"
            }
            className={
              !sp?.resourceType
                ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
            }
          >
            All
          </Link>
          {facets.resourceTypes.map((rt) => (
            <Link
              key={rt}
              href={`/audit?resourceType=${encodeURIComponent(rt)}${sp?.action ? `&action=${encodeURIComponent(sp.action)}` : ""}`}
              className={
                sp?.resourceType === rt
                  ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                  : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
              }
            >
              {rt}
            </Link>
          ))}
        </div>

        {facets.actions.length > 0 ? (
          <>
            <Eyebrow>Filter by action</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {facets.actions.slice(0, 24).map((a) => (
                <Link
                  key={a}
                  href={`/audit?action=${encodeURIComponent(a)}${sp?.resourceType ? `&resourceType=${encodeURIComponent(sp.resourceType)}` : ""}`}
                  className={
                    sp?.action === a
                      ? "rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-fg"
                      : "rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-fg-muted hover:bg-surface-2 hover:text-fg"
                  }
                >
                  {a}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {page.items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit events"
          description="Once any state change happens on the platform, it'll appear here in chronological order."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Eyebrow>Timeline</Eyebrow>
              <p className="mt-1 text-[13px] text-fg-muted">
                {page.items.length} most recent events · newest first
              </p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              Append-only
            </span>
          </header>
          <ol className="divide-y divide-border">
            {page.items.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[16px_140px_1fr_auto] items-start gap-4 px-6 py-3.5"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 rounded-full ${dotColorFor(e.action)}`}
                />
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                  {fmt(e.tsUtc)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-fg">
                    <span className="font-mono text-[11px] uppercase tracking-wide">
                      {e.action}
                    </span>
                    <span className="ml-2 text-fg-muted">on</span>{" "}
                    <span className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">
                      {e.resourceType}
                    </span>
                    {e.resourceId ? (
                      <span className="ml-1 font-mono text-[11px] text-fg-muted">
                        · {e.resourceId.slice(0, 8)}
                      </span>
                    ) : null}
                  </p>
                  {e.actorUserId ? (
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      actor · {e.actorUserId.slice(0, 8)}
                      {e.ipAddr ? ` · ${e.ipAddr}` : ""}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/audit/${e.id}`}
                  className="font-mono text-[10px] uppercase tracking-wide text-fg-muted hover:text-fg"
                >
                  Inspect →
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
