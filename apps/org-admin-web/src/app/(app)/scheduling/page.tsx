import { fetchAll, load } from "@sportspulse/api-client";
import Link from "next/link";
import { CalendarRange, Wand2 } from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  LoadError
} from "@sportspulse/ui";
import { leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const metadata = { title: "Schedule — Org Admin" };
export const dynamic = "force-dynamic";

/**
 * Scheduling index — lists every season in the active org with a
 * Generate link. Org-scoped via `getActiveOrgId`; the Edge Functions
 * also gate `scheduler.run`/`scheduler.publish` by the user's role
 * assignment scope, so defense-in-depth is in place.
 */
export default async function OrgAdminSchedulingPage() {
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  const pageResult = orgId
    ? await load(fetchAll((cursor) => leagueMgmt.listSeasons({ orgId, limit: 100, cursor })))
    : null;
  const page = pageResult?.ok ? pageResult.data : { items: [], nextCursor: null };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title="Schedule"
        description="Pick a season to generate, publish, verify, or resolve conflicts."
      />
      {pageResult && !pageResult.ok ? (
        <LoadError what="seasons" status={pageResult.status} message={pageResult.message} />
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No seasons yet"
          description="Create a season via Org setup before generating a schedule."
          action={
            <Link
              href="/org-setup"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
            >
              <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Org setup
            </Link>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Window</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  <Link href={`/seasons/${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {s.startDate} → {s.endDate}
                </TD>
                <TD>
                  <Badge>{s.status.replace(/_/g, " ")}</Badge>
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/scheduling/${s.id}/generate`}
                    className="inline-flex h-7 items-center rounded-md border border-border bg-bg px-2.5 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
                  >
                    Generate →
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
