import { fetchAll } from "@sportspulse/api-client";
import { Alert } from "@sportspulse/ui";
import { CalendarRange, Wand2, Trophy, CircleDot, Archive } from "lucide-react";
import Link from "next/link";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import { UrlFilters } from "@/components/ui/url-filters";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { AssignAdminCell } from "@/components/roles/assign-admin-cell";
import type { Season } from "@/lib/api/types";

export const metadata = { title: "Seasons — SportsPulse" };

/** Season lifecycle states, in order, with the labels the UI uses. */
const SEASON_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "registration_open", label: "Registration open" },
  { value: "in_progress", label: "In progress" },
  { value: "playoffs", label: "Playoffs" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" }
];

/**
 * View-only listing — creation lives exclusively in /org-setup so the
 * 4-phase wizard stays the single source of truth (per repo owner
 * directive, 2026-05-09). Click a row → /seasons/[id] for full info.
 * Filters live in the URL (?q=&leagueId=&status=&sport=).
 */
export default async function SeasonsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; leagueId?: string; status?: string; sport?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  let loadFailed = false;
  const [seasonsPage, leaguesPage] = await Promise.all([
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch((e) => {
      // Show the failure; an empty list here read as "No seasons yet".
      console.error("[seasons] listSeasons failed", e);
      loadFailed = true;
      return { items: [] as Season[] };
    }),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [] }))
  ]);
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = seasonsPage.items.filter((s) => {
    if (sp.leagueId && s.leagueId !== sp.leagueId) return false;
    if (sp.status && s.status !== sp.status) return false;
    if (sp.sport && s.sportCode !== sp.sport) return false;
    if (q) {
      const hay = `${s.name} ${leagueMap.get(s.leagueId) ?? ""} ${s.sportCode}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const leagueIdsWithSeasons = new Set(seasonsPage.items.map((s) => s.leagueId));
  const leagueOptions = leaguesPage.items
    .filter((l) => leagueIdsWithSeasons.has(l.id))
    .map((l) => ({ value: l.id, label: l.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const sportOptions = [...new Set(seasonsPage.items.map((s) => s.sportCode))]
    .sort()
    .map((s) => ({ value: s, label: s }));

  const orgSetupCta = (
    <Link
      href="/org-setup"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
    >
      <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      New season → Org setup
    </Link>
  );

  const total = seasonsPage.items.length;
  const inProgress = seasonsPage.items.filter(
    (s) => s.status === "in_progress" || s.status === "playoffs"
  ).length;
  const open = seasonsPage.items.filter(
    (s) => s.status === "registration_open"
  ).length;
  const drafts = seasonsPage.items.filter((s) => s.status === "draft").length;
  const archived = seasonsPage.items.filter(
    (s) => s.status === "archived" || s.status === "completed"
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="lifecycle"
        title="Seasons"
        description={
          sp.leagueId
            ? `Filtered by league ${leagueMap.get(sp.leagueId) ?? "Unknown league"}`
            : "Time-bounded instances of a league. Click a row to inspect; create new seasons via Org setup."
        }
        action={orgSetupCta}
      />
      <KineticStrip
        cards={[
          {
            label: "In progress",
            value: inProgress,
            icon: <CircleDot className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: inProgress > 0 ? "ok" : "idle"
          },
          {
            label: "Registration open",
            value: open,
            icon: <Trophy className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: open > 0 ? "info" : "idle"
          },
          {
            label: "Drafts",
            value: drafts,
            icon: <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: drafts > 0 ? "warn" : "idle"
          },
          {
            label: "Archived / done",
            value: archived,
            icon: <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          }
        ]}
      />

      <div className="space-y-2">
        <UrlFilters
          searchPlaceholder="Search seasons by name, league or sport"
          selects={[
            { param: "leagueId", label: "League", allLabel: "All leagues", options: leagueOptions },
            { param: "status", label: "Status", allLabel: "All statuses", options: SEASON_STATUS_OPTIONS },
            { param: "sport", label: "Sport", allLabel: "All sports", options: sportOptions }
          ]}
        />
        <p className="text-[12px] text-fg-muted">
          Showing {shown.length} of {total} seasons
        </p>
      </div>

      {loadFailed ? (
        <Alert tone="error">
          Could not load seasons. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : total === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No seasons yet"
          description="New seasons are created via the 4-phase Org setup wizard."
          action={orgSetupCta}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No seasons match these filters"
          description="Clear the search or pick a different league, status or sport."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>League</TH>
              <TH>Sport</TH>
              <TH>Window</TH>
              <TH>Timezone</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  <Link
                    href={`/seasons/${s.id}`}
                    className="hover:underline"
                  >
                    {s.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {leagueMap.get(s.leagueId) ?? "Unknown league"}
                </TD>
                <TD className="text-muted-foreground">{s.sportCode}</TD>
                <TD className="text-muted-foreground">
                  {s.startDate} → {s.endDate}
                </TD>
                <TD className="text-muted-foreground">{s.timezone}</TD>
                <TD>
                  <Badge tone={statusTone(s.status)}>
                    {s.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="season"
                    scopeId={s.id}
                    resourceLabel={s.name}
                    allowedRoleCodes={["season_admin", "registrar"]}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
