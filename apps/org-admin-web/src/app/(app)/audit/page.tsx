import { FileBarChart } from "lucide-react";
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
import { audit, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit · Org Admin" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

/**
 * Audit log scoped to the caller's org. Same listing the platform
 * console uses, filtered by the orgId query param. The audit
 * interceptor records every successful 2xx mutation; this is the
 * read-only viewer.
 *
 * P5-D part 2 — alongside other org-admin-web surfaces.
 */
export default async function AuditPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = scope?.orgIds[0];

  const page = orgId
    ? await audit.list({ orgId, limit: 100 }).catch(() => ({
        items: [],
        nextCursor: null
      }))
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Audit"
        title="Audit log"
        description="Every mutation recorded for this org — who, what, when. Read-only; corrections happen through the canonical write path that created the row."
      />

      {page.items.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="No audit events yet"
          description="As soon as someone makes a change in your org, it'll be recorded here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Resource</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((e) => (
              <TR key={e.id}>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {fmt(e.createdAt)}
                </TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {e.actorUserId
                    ? e.actorUserId.slice(0, 8)
                    : <span className="italic">system</span>}
                </TD>
                <TD>
                  <Badge mono tone="info">
                    {e.action}
                  </Badge>
                </TD>
                <TD className="text-[12px] text-fg">
                  <span className="font-mono text-fg-muted">
                    {e.resourceType}
                  </span>
                  {e.resourceId && (
                    <>
                      <span className="px-1.5 text-fg-muted/40">·</span>
                      <span className="font-mono text-[11px] text-fg-muted">
                        {e.resourceId.slice(0, 8)}
                      </span>
                    </>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
