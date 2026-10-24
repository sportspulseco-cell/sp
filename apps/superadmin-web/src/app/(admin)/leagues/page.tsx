import { fetchAll } from "@sportspulse/api-client";
import { Alert } from "@sportspulse/ui";
import { Trophy, Wand2, Network, Archive, Layers } from "lucide-react";
import Link from "next/link";
import { leagueMgmt, orgs } from "@/lib/api/server-api";
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
import { LeagueActions } from "@/components/edit/detail-actions";
import type { League } from "@/lib/api/types";

export const metadata = { title: "Leagues — SportsPulse" };

/**
 * View-only listing — creation lives exclusively in /org-setup so the
 * 4-phase wizard stays the single source of truth (per repo owner
 * directive). Click a row → /leagues/[id] for full league info.
 * Filters live in the URL (?q=&orgId=&status=&sport=).
 */
export default async function LeaguesPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; orgId?: string; status?: string; sport?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  let loadFailed = false;
  const [leaguesPage, orgList, governingBodies] = await Promise.all([
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch((e) => {
      // Show the failure; an empty list here read as "No leagues yet".
      console.error("[leagues] listLeagues failed", e);
      loadFailed = true;
      return { items: [] as League[] };
    }),
    fetchAll((cursor) => orgs.list({ limit: 100, cursor })).catch(() => ({ items: [] })),
    leagueMgmt.listGoverningBodies({}).catch(() => [])
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = leaguesPage.items.filter((l) => {
    if (sp.orgId && l.orgId !== sp.orgId) return false;
    if (sp.status && l.status !== sp.status) return false;
    if (sp.sport && l.sportCode !== sp.sport) return false;
    if (q) {
      const hay = `${l.name} ${orgMap.get(l.orgId) ?? ""} ${l.sportCode} ${l.format}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const orgIdsWithLeagues = new Set(leaguesPage.items.map((l) => l.orgId));
  const orgOptions = orgList.items
    .filter((o) => orgIdsWithLeagues.has(o.id))
    .map((o) => ({ value: o.id, label: o.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const sportOptions = [...new Set(leaguesPage.items.map((l) => l.sportCode))]
    .sort()
    .map((s) => ({ value: s, label: s }));

  const orgSetupCta = (
    <Link
      href="/org-setup"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
    >
      <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      New league → Org setup
    </Link>
  );

  const total = leaguesPage.items.length;
  const active = leaguesPage.items.filter((l) => l.status === "active").length;
  const draft = leaguesPage.items.filter((l) => l.status === "draft").length;
  const archived = leaguesPage.items.filter(
    (l) => l.status === "archived"
  ).length;
  const sportsCount = new Set(leaguesPage.items.map((l) => l.sportCode)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="competition"
        title="Leagues"
        description={
          sp.orgId
            ? `Filtered by org ${orgMap.get(sp.orgId) ?? "Unknown org"}`
            : "Persistent competition containers. Click a row to inspect; create new leagues via Org setup."
        }
        action={orgSetupCta}
      />
      <KineticStrip
        cards={[
          {
            label: "Active",
            value: active,
            icon: <Trophy className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: active > 0 ? "ok" : "idle"
          },
          {
            label: "Draft",
            value: draft,
            icon: <Network className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: draft > 0 ? "warn" : "idle"
          },
          {
            label: "Archived",
            value: archived,
            icon: <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          },
          {
            label: "Sports",
            value: sportsCount,
            icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          }
        ]}
      />

      <div className="space-y-2">
        <UrlFilters
          searchPlaceholder="Search leagues by name, organisation, sport or format"
          selects={[
            { param: "orgId", label: "Organisation", allLabel: "All organisations", options: orgOptions },
            {
              param: "status",
              label: "Status",
              allLabel: "All statuses",
              options: [
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" }
              ]
            },
            { param: "sport", label: "Sport", allLabel: "All sports", options: sportOptions }
          ]}
        />
        <p className="text-[12px] text-fg-muted">
          Showing {shown.length} of {total} leagues
        </p>
      </div>

      {loadFailed ? (
        <Alert tone="error">
          Could not load leagues. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : total === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues yet"
          description="New leagues are created via the 4-phase Org setup wizard."
          action={orgSetupCta}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues match these filters"
          description="Clear the search or pick a different organisation, status or sport."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Organisation</TH>
              <TH>Sport</TH>
              <TH>Format</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">
                  <Link
                    href={`/leagues/${l.id}`}
                    className="hover:underline"
                  >
                    {l.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {orgMap.get(l.orgId) ?? "Unknown org"}
                </TD>
                <TD className="text-muted-foreground">{l.sportCode}</TD>
                <TD className="text-muted-foreground">{l.format}</TD>
                <TD>
                  <Badge tone={statusTone(l.status)}>
                    {l.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="league"
                    scopeId={l.id}
                    resourceLabel={l.name}
                    allowedRoleCodes={[
                      "league_admin",
                      "registrar",
                      "referee",
                      "scorekeeper"
                    ]}
                  />
                </TD>
                <TD>
                  <LeagueActions league={l} governingBodies={governingBodies} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
