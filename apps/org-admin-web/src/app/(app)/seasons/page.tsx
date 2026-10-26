import { fetchAll } from "@sportspulse/api-client";
import { formatCalendarDate } from "@sportspulse/kernel";
/* Hallmark · page: list (seasons) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { CalendarRange, Wand2 } from "lucide-react";
import {
  Alert,
  Badge,
  EmptyState,
  SectionRail,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  UrlFilters
} from "@sportspulse/ui";
import type { Season } from "@sportspulse/api-client";
import { leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seasons · Org Admin" };

function fmt(iso: string | null | undefined): string {
  return formatCalendarDate(iso) || "—";
}

const OPEN_STATES = new Set([
  "active",
  "registration_open",
  "in_progress"
]);

/** Season lifecycle states, in order, with the labels the UI uses. */
const SEASON_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "registration_open", label: "Registration open" },
  { value: "in_progress", label: "In progress" },
  { value: "playoffs", label: "Playoffs" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" }
];

/** Filters live in the URL (?q=&leagueId=&status=). */
export default async function SeasonsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; leagueId?: string; status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  let loadFailed = false;
  const [page, leaguesPage] = orgId
    ? await Promise.all([
        fetchAll((cursor) => leagueMgmt.listSeasons({ orgId, limit: 100, cursor })).catch((e) => {
          // Show the failure; an empty list here read as "No seasons yet".
          console.error("[seasons] listSeasons failed", e);
          loadFailed = true;
          return { items: [] as Season[], nextCursor: null };
        }),
        fetchAll((cursor) => leagueMgmt.listLeagues({ orgId, limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null }))
      ])
    : [{ items: [] as Season[], nextCursor: null }, { items: [], nextCursor: null }];
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = page.items.filter((s) => {
    if (sp.leagueId && s.leagueId !== sp.leagueId) return false;
    if (sp.status && (s.status as string) !== sp.status) return false;
    if (q) {
      const hay = `${s.name} ${leagueMap.get(s.leagueId) ?? ""} ${s.sportCode}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const leagueIdsWithSeasons = new Set(page.items.map((s) => s.leagueId));
  const leagueOptions = leaguesPage.items
    .filter((l) => leagueIdsWithSeasons.has(l.id))
    .map((l) => ({ value: l.id, label: l.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const open = page.items.filter((s) => OPEN_STATES.has(s.status as string)).length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Seasons"
        title="Seasons"
        description="Seasons across every league in your org. New seasons are created through Org setup alongside their league and divisions."
        action={
          <Link
            href="/org-setup"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg transition-colors duration-fast ease-ease hover:bg-[var(--accent-hover)]"
          >
            <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
            Open org setup
          </Link>
        }
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Schedule"
          subtitle="Every season your org is running. Open one to manage divisions, registrations, and game ops."
          meta={`${open} open · ${page.items.length} total`}
        />
        <div className="space-y-2">
          <UrlFilters
            searchPlaceholder="Search seasons by name, league or sport"
            selects={[
              { param: "leagueId", label: "League", allLabel: "All leagues", options: leagueOptions },
              { param: "status", label: "Status", allLabel: "All statuses", options: SEASON_STATUS_OPTIONS }
            ]}
          />
          <p className="text-[12px] text-fg-muted">
            Showing {shown.length} of {page.items.length} seasons
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {loadFailed ? (
            <div className="p-4">
              <Alert tone="error">
                Could not load seasons. This is a server problem on our side, not your data. Reload to try again.
              </Alert>
            </div>
          ) : page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={CalendarRange}
                title="No seasons yet"
                description="Head to Org setup to spin up your first league, season, and divisions in one flow."
              />
            </div>
          ) : shown.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={CalendarRange}
                title="No seasons match these filters"
                description="Clear the search or pick a different league or status."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>League</TH>
                  <TH>Sport</TH>
                  <TH>Window</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium text-fg">
                      <Link href={`/seasons/${s.id}`} className="hover:text-accent">
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="text-fg-muted">{leagueMap.get(s.leagueId) ?? "Unknown league"}</TD>
                    <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">{s.sportCode}</TD>
                    <TD className="text-[12px] text-fg-muted">
                      {fmt(s.startDate)} to {fmt(s.endDate)}
                    </TD>
                    <TD>
                      <Badge status={s.status} />
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
