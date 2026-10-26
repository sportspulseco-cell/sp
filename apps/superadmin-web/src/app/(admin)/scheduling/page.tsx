import { fetchAll, load } from "@sportspulse/api-client";
import { Badge, LoadError } from "@sportspulse/ui";
import { CalendarRange, Wand2 } from "lucide-react";
import Link from "next/link";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

export const metadata = { title: "Schedule — SportsPulse" };

/**
 * Scheduling index — list every season with a one-click "Generate"
 * link to the run form. We deliberately don't filter for "in_progress"
 * seasons here; admins re-generate drafts and re-publish completed
 * ones for archival exports. Status is shown so they pick correctly.
 */
export default async function SchedulingIndexPage() {
  const [seasonsResult, leaguesPage] = await Promise.all([
    load(fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor }))),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [] }))
  ]);
  if (!seasonsResult.ok) {
    console.error("[scheduling] listSeasons failed", seasonsResult.status, seasonsResult.message);
  }
  const seasonsPage = seasonsResult.ok ? seasonsResult.data : { items: [] };
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Schedule"
        title="Schedule"
        description="Pick a season to generate, publish and check its schedule, or fix conflicts."
      />
      {!seasonsResult.ok ? (
        <LoadError
          what="seasons"
          status={seasonsResult.status}
          message={seasonsResult.message}
        />
      ) : seasonsPage.items.length === 0 ? (
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
              <TH>League</TH>
              <TH>Window</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {seasonsPage.items.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  <Link href={`/seasons/${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {leagueMap.get(s.leagueId) ?? "Unknown league"}
                </TD>
                <TD className="text-muted-foreground">
                  {s.startDate} → {s.endDate}
                </TD>
                <TD>
                  <Badge status={s.status} />
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
