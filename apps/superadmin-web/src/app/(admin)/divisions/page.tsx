import { fetchAll } from "@sportspulse/api-client";
import { Alert } from "@sportspulse/ui";
import { Layers, Wand2, Network, Users } from "lucide-react";
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
import type { Division, Season } from "@/lib/api/types";

export const metadata = { title: "Divisions — SportsPulse" };

/**
 * Post-flip hierarchy: Org → League → Season → Region → Division.
 * Filters live in the URL (?q=&seasonId=&region=&tier=&status=); the
 * legacy ?leagueId= from older links still narrows to that league's
 * seasons. Everything is filtered here from the full list, so the
 * dropdowns always offer every season/region/tier that exists.
 */
export default async function DivisionsPage({
  searchParams
}: {
  searchParams?: Promise<{
    q?: string;
    seasonId?: string;
    leagueId?: string;
    region?: string;
    tier?: string;
    status?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  let loadFailed = false;
  const fail = <T,>(what: string, empty: T) => (e: unknown) => {
    console.error(`[divisions] ${what} failed`, e);
    loadFailed = true;
    return empty;
  };

  const [seasonsPage, leaguesPage, all] = await Promise.all([
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(
      fail("listSeasons", { items: [] as Season[] })
    ),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt.listDivisions({ limit: 100, cursor })).catch(
      fail("listDivisions", { items: [] as Division[] })
    )
  ]);
  const seasonMap = new Map(seasonsPage.items.map((s) => [s.id, s]));
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  // Season names repeat across leagues ("Winter 2026-27"); disambiguate
  // with the league name only when needed.
  const seasonNameCount = new Map<string, number>();
  for (const s of seasonsPage.items) seasonNameCount.set(s.name, (seasonNameCount.get(s.name) ?? 0) + 1);
  const seasonLabel = (s: Season) =>
    (seasonNameCount.get(s.name) ?? 0) > 1 ? `${s.name} · ${leagueMap.get(s.leagueId) ?? "Unknown league"}` : s.name;

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = all.items.filter((d) => {
    const s = seasonMap.get(d.seasonId);
    if (sp.seasonId && d.seasonId !== sp.seasonId) return false;
    if (sp.leagueId && s?.leagueId !== sp.leagueId) return false;
    if (sp.region && (sp.region === "none" ? !!d.regionName : d.regionName !== sp.region)) return false;
    if (sp.tier && (sp.tier === "none" ? !!d.tier : d.tier !== sp.tier)) return false;
    if (sp.status && d.status !== sp.status) return false;
    if (q) {
      const hay = `${d.name} ${d.regionName ?? ""} ${d.tier ?? ""} ${s?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const seasonIdsWithDivisions = new Set(all.items.map((d) => d.seasonId));
  const seasonOptions = seasonsPage.items
    .filter((s) => seasonIdsWithDivisions.has(s.id))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((s) => ({ value: s.id, label: seasonLabel(s) }));
  const regionOptions = [
    ...[...new Set(all.items.map((d) => d.regionName).filter((r): r is string => !!r))]
      .sort()
      .map((r) => ({ value: r, label: r })),
    { value: "none", label: "No region" }
  ];
  const tierOptions = [
    ...[...new Set(all.items.map((d) => d.tier).filter((t): t is string => !!t))]
      .sort()
      .map((t) => ({ value: t, label: t })),
    { value: "none", label: "No tier" }
  ];

  const filterLabel = sp.seasonId
    ? `Filtered by season ${seasonMap.get(sp.seasonId)?.name ?? "Unknown season"}`
    : sp.leagueId
    ? `Filtered by league ${leagueMap.get(sp.leagueId) ?? "Unknown league"}`
    : "Age + tier + gender groupings within a season. Click a row to inspect; create new divisions via Org setup.";

  const orgSetupCta = (
    <Link
      href="/org-setup"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
    >
      <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      New division → Org setup
    </Link>
  );

  const total = all.items.length;
  const tiers = new Set(all.items.map((d) => d.tier).filter(Boolean)).size;
  const totalSlots = all.items.reduce((acc, d) => acc + (d.maxTeams ?? 0), 0);
  const seasonsCovered = seasonIdsWithDivisions.size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="brackets"
        title="Divisions"
        description={filterLabel}
        action={orgSetupCta}
      />
      <KineticStrip
        cards={[
          { label: "Total divisions", value: total, icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          { label: "Distinct tiers", value: tiers, icon: <Network className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "info" },
          {
            label: "Team capacity",
            value: totalSlots,
            icon: <Users className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle",
            hint: "sum of max teams across all divisions"
          },
          {
            label: "Seasons",
            value: seasonsCovered,
            tone: "idle"
          }
        ]}
      />

      <div className="space-y-2">
        <UrlFilters
          searchPlaceholder="Search divisions by name, region, tier or season"
          selects={[
            { param: "seasonId", label: "Season", allLabel: "All seasons", options: seasonOptions },
            { param: "region", label: "Region", allLabel: "All regions", options: regionOptions },
            { param: "tier", label: "Tier", allLabel: "All tiers", options: tierOptions },
            {
              param: "status",
              label: "Status",
              allLabel: "All statuses",
              options: [
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" }
              ]
            }
          ]}
        />
        <p className="text-[12px] text-fg-muted">
          Showing {shown.length} of {total} divisions
        </p>
      </div>

      {loadFailed ? (
        <Alert tone="error">
          Could not load divisions. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : total === 0 ? (
        <EmptyState
          icon={Layers}
          title="No divisions yet"
          description="New divisions are created via the 4-phase Org setup wizard's Divisions step."
          action={orgSetupCta}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No divisions match these filters"
          description="Clear the search or pick a different season, region, tier or status."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Season</TH>
              <TH>Region</TH>
              <TH>Tier</TH>
              <TH>Gender eligibility</TH>
              <TH>Max teams</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((d) => {
              const s = seasonMap.get(d.seasonId);
              return (
                <TR key={d.id}>
                  <TD className="font-medium">
                    <Link href={`/divisions/${d.id}`} className="hover:underline">
                      {d.name}
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">
                    {s ? seasonLabel(s) : "Unknown season"}
                  </TD>
                  <TD className="text-muted-foreground">{d.regionName ?? "—"}</TD>
                  <TD className="text-muted-foreground">{d.tier ?? "—"}</TD>
                  <TD className="text-muted-foreground capitalize">
                    {d.genderEligibility}
                  </TD>
                  <TD className="text-muted-foreground">
                    {d.maxTeams ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                  </TD>
                  <TD>
                    <AssignAdminCell
                      scopeType="division"
                      scopeId={d.id}
                      resourceLabel={d.name}
                      allowedRoleCodes={["division_admin"]}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
