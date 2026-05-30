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
  Table
} from "@sportspulse/ui";
import { iam, leagueMgmt } from "@/lib/api/server-api";
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
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await leagueMgmt
        .listSeasons({ orgId })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title="Schedule"
        description="Pick a season to generate, publish, verify, or resolve conflicts."
      />
      {page.items.length === 0 ? (
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
