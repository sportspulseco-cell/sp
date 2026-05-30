import { CalendarRange, Wand2 } from "lucide-react";
import Link from "next/link";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
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
  const [seasonsPage, leaguesPage] = await Promise.all([
    leagueMgmt.listSeasons({}).catch(() => ({ items: [] })),
    leagueMgmt.listLeagues().catch(() => ({ items: [] }))
  ]);
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title="Schedule"
        description="Pick a season to generate, publish, verify, or resolve conflicts."
      />
      {seasonsPage.items.length === 0 ? (
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
                  {leagueMap.get(s.leagueId) ?? s.leagueId.slice(0, 8)}
                </TD>
                <TD className="text-muted-foreground">
                  {s.startDate} → {s.endDate}
                </TD>
                <TD>
                  <Badge tone={statusTone(s.status)}>
                    {s.status.replace(/_/g, " ")}
                  </Badge>
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
