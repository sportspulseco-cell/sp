import { ScrollText } from "lucide-react";
import { audit } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Audit — League Admin" };

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

export default async function AuditPage() {
  const page = await audit
    .list({ limit: 50 })
    .catch(() => ({ items: [], nextCursor: null }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="PLATFORM"
        title="Audit"
        description="Append-only ledger of every state change visible to your role."
      />
      {page.items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit events"
          description="No events visible to your account."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <ol className="divide-y divide-border">
            {page.items.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[140px_1fr_auto] items-start gap-4 px-6 py-3.5"
              >
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                  {fmt(e.tsUtc)}
                </span>
                <p className="text-sm text-fg">
                  <span className="font-mono text-[11px] uppercase tracking-wide">
                    {e.action}
                  </span>
                  <span className="ml-2 text-fg-muted">
                    on {e.resourceType}
                  </span>
                </p>
                <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                  {e.actorUserId?.slice(0, 8) ?? "system"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
