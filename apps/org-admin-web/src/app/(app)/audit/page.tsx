/* Hallmark · page: list (audit) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { FileBarChart } from "lucide-react";
import {
  Badge,
  EmptyState,
  SectionRail,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { audit, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit · Org Admin" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

export default async function AuditPage() {
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await audit.list({ orgId, limit: 100 }).catch(() => ({
        items: [],
        nextCursor: null
      }))
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="History"
        title="Activity log"
        description="Who changed what in your organisation, and when. Read-only."
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Trail"
          subtitle="Captured by the global audit interceptor. Tap a row's timestamp to see the full before/after payload."
          meta={`${page.items.length} loaded`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={FileBarChart}
                title="No audit events yet"
                description="As soon as someone makes a change in your org, it'll be recorded here."
              />
            </div>
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
                      <Link href={`/audit/${e.id}`} className="hover:text-accent">
                        {fmt(e.createdAt)}
                      </Link>
                    </TD>
                    <TD className="text-[12px] text-fg-muted">
                      {e.actorUserId
                        ? (e.actorName ?? "Unknown user")
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
                      {e.resourceName && (
                        <>
                          <span className="px-1.5 text-fg-muted/40">·</span>
                          <span className="text-fg-muted">{e.resourceName}</span>
                        </>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
