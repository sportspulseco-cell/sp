import { fetchAll } from "@sportspulse/api-client";
/* Hallmark · page: list (divisions) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { Layers, Wand2 } from "lucide-react";
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
import type { Division, Season } from "@sportspulse/api-client";
import { leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Divisions · Org Admin" };

/** Filters live in the URL (?q=&seasonId=&region=&tier=&status=). */
export default async function DivisionsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; seasonId?: string; region?: string; tier?: string; status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  let loadFailed = false;
  const seasonsPage = orgId
    ? await fetchAll((cursor) => leagueMgmt.listSeasons({ orgId, limit: 100, cursor })).catch((e) => {
        console.error("[divisions] listSeasons failed", e);
        loadFailed = true;
        return { items: [] as Season[], nextCursor: null };
      })
    : { items: [] as Season[], nextCursor: null };

  // One paged list, which the API limits to the caller's leagues, kept to
  // this org's seasons. One call per season sent ~100 requests at once on
  // staging and ran the database pooler out of connections (CONSOLE-22).
  const seasonMap = new Map(seasonsPage.items.map((s) => [s.id, s]));
  const divisionsPage = seasonsPage.items.length
    ? await fetchAll((cursor) => leagueMgmt.listDivisions({ limit: 100, cursor })).catch((e) => {
        console.error("[divisions] listDivisions failed", e);
        loadFailed = true;
        return { items: [] as Division[], nextCursor: null };
      })
    : { items: [] as Division[], nextCursor: null };
  const all: Division[] = divisionsPage.items.filter((d) => seasonMap.has(d.seasonId));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = all.filter((d) => {
    if (sp.seasonId && d.seasonId !== sp.seasonId) return false;
    if (sp.region && (sp.region === "none" ? !!d.regionName : d.regionName !== sp.region)) return false;
    if (sp.tier && (sp.tier === "none" ? !!d.tier : d.tier !== sp.tier)) return false;
    if (sp.status && d.status !== sp.status) return false;
    if (q) {
      const hay = `${d.name} ${d.regionName ?? ""} ${d.tier ?? ""} ${seasonMap.get(d.seasonId)?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const seasonIdsWithDivisions = new Set(all.map((d) => d.seasonId));
  const seasonOptions = seasonsPage.items
    .filter((s) => seasonIdsWithDivisions.has(s.id))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((s) => ({ value: s.id, label: s.name }));
  const regionOptions = [
    ...[...new Set(all.map((d) => d.regionName).filter((r): r is string => !!r))]
      .sort()
      .map((r) => ({ value: r, label: r })),
    { value: "none", label: "No region" }
  ];
  const tierOptions = [
    ...[...new Set(all.map((d) => d.tier).filter((t): t is string => !!t))]
      .sort()
      .map((t) => ({ value: t, label: t })),
    { value: "none", label: "No tier" }
  ];

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Divisions"
        title="Divisions"
        description="Divisions across every season in your org. New divisions are created through Org setup alongside their league and season."
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
          label="Brackets"
          subtitle="Each row groups teams by region, age, tier, or gender. Open one to see its team applications and eligibility rules."
          meta={`${all.length} total · ${seasonsPage.items.length} seasons`}
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
            Showing {shown.length} of {all.length} divisions
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {loadFailed ? (
            <div className="p-4">
              <Alert tone="error">
                Could not load divisions. This is a server problem on our side, not your data. Reload to try again.
              </Alert>
            </div>
          ) : all.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Layers}
                title="No divisions yet"
                description="Head to Org setup to set up a league, season, and divisions in one flow."
              />
            </div>
          ) : shown.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Layers}
                title="No divisions match these filters"
                description="Clear the search or pick a different season, region, tier or status."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Season</TH>
                  <TH>Region</TH>
                  <TH>Tier</TH>
                  <TH>Gender eligibility</TH>
                  <TH className="text-right">Max teams</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((d: Division) => (
                  <TR key={d.id}>
                    <TD className="font-medium text-fg">
                      <Link href={`/divisions/${d.id}`} className="hover:text-accent">
                        {d.name}
                      </Link>
                    </TD>
                    <TD className="text-fg-muted">{seasonMap.get(d.seasonId)?.name ?? "Unknown season"}</TD>
                    <TD className="text-fg-muted">{d.regionName ?? "—"}</TD>
                    <TD className="text-fg-muted">{d.tier ?? "—"}</TD>
                    <TD>
                      <Badge mono tone="neutral">{d.genderEligibility ?? "open"}</Badge>
                    </TD>
                    <TD className="text-right font-mono tabular-nums text-fg-muted">
                      {d.maxTeams ?? "—"}
                    </TD>
                    <TD>
                      <Badge status={d.status} />
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
