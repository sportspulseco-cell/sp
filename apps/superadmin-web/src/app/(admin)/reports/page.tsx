import { ClipboardList, FileBarChart, ListChecks, Trophy } from "lucide-react";
import { leagueMgmt, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { ReportDownloader } from "@/components/reports/report-downloader";

export const metadata = { title: "Reports — SportsPulse" };

export default async function ReportsPage() {
  const [leaguesPage, orgsPage, seasonsPage] = await Promise.all([
    leagueMgmt.listLeagues().catch(() => ({ items: [], nextCursor: null })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listSeasons().catch(() => ({ items: [], nextCursor: null }))
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="analytics"
        title="Reports"
        description="Generate CSV exports of standings, rosters, and registrations. Files stream directly from the API and are not stored."
      />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center gap-3 border-b border-border px-6 py-4">
            <IconTile icon={Trophy} tint="amber" size="sm" />
            <div>
              <Eyebrow>Standings</Eyebrow>
              <p className="mt-0.5 text-sm font-semibold tracking-tight text-fg">
                League standings
              </p>
            </div>
          </header>
          <div className="p-5">
            <ReportDownloader
              endpoint="/reports/standings.csv"
              filename="standings.csv"
              filters={[
                {
                  type: "select",
                  param: "leagueId",
                  label: "League",
                  required: true,
                  options: leaguesPage.items.map((l) => ({
                    value: l.id,
                    label: l.name
                  }))
                }
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center gap-3 border-b border-border px-6 py-4">
            <IconTile icon={ListChecks} tint="blue" size="sm" />
            <div>
              <Eyebrow>Rosters</Eyebrow>
              <p className="mt-0.5 text-sm font-semibold tracking-tight text-fg">
                Active memberships
              </p>
            </div>
          </header>
          <div className="p-5">
            <ReportDownloader
              endpoint="/reports/rosters.csv"
              filename="rosters.csv"
              filters={[
                {
                  type: "select",
                  param: "seasonId",
                  label: "Season",
                  required: false,
                  options: seasonsPage.items.map((s) => ({
                    value: s.id,
                    label: s.name
                  }))
                }
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center gap-3 border-b border-border px-6 py-4">
            <IconTile icon={ClipboardList} tint="violet" size="sm" />
            <div>
              <Eyebrow>Registrations</Eyebrow>
              <p className="mt-0.5 text-sm font-semibold tracking-tight text-fg">
                Submitted registrations
              </p>
            </div>
          </header>
          <div className="p-5">
            <ReportDownloader
              endpoint="/reports/registrations.csv"
              filename="registrations.csv"
              filters={[
                {
                  type: "select",
                  param: "orgId",
                  label: "Org",
                  required: false,
                  options: orgsPage.items.map((o) => ({
                    value: o.id,
                    label: o.displayName
                  }))
                },
                {
                  type: "select",
                  param: "status",
                  label: "Status",
                  required: false,
                  options: [
                    { value: "draft", label: "Draft" },
                    { value: "submitted", label: "Submitted" },
                    { value: "under_review", label: "Under review" },
                    { value: "approved", label: "Approved" },
                    { value: "rejected", label: "Rejected" },
                    { value: "waitlisted", label: "Waitlisted" },
                    { value: "withdrawn", label: "Withdrawn" }
                  ]
                }
              ]}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <div className="flex items-start gap-4">
          <IconTile icon={FileBarChart} tint="emerald" size="md" />
          <div className="space-y-1">
            <Eyebrow>Coming soon</Eyebrow>
            <p className="text-sm font-semibold tracking-tight text-fg">
              Scheduled reports + PDF
            </p>
            <p className="text-[13px] text-fg-muted">
              Save filter sets, run on a cadence, deliver to email — and a
              themed PDF renderer for league handouts.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
