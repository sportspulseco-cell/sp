import { fetchAll } from "@sportspulse/api-client";
/* Hallmark · page: list (teams) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { Network, Plus } from "lucide-react";
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
import type { Team } from "@sportspulse/api-client";
import { leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams - Org Admin" };

export default async function TeamsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; sport?: string; status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  let loadFailed = false;
  const page = orgId
    ? await fetchAll((cursor) => leagueMgmt.listTeams({ orgId, limit: 100, cursor })).catch((e) => {
        // Show the failure; an empty list here read as "No teams yet".
        console.error("[teams] listTeams failed", e);
        loadFailed = true;
        return { items: [] as Team[], nextCursor: null };
      })
    : { items: [] as Team[], nextCursor: null };

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = page.items.filter((t) => {
    if (sp.sport && t.sportCode !== sp.sport) return false;
    if (sp.status && (t.status as string) !== sp.status) return false;
    if (q) {
      const hay = `${t.name} ${t.shortName ?? ""} ${t.captainName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sportOptions = [...new Set(page.items.map((t) => t.sportCode))]
    .sort()
    .map((s) => ({ value: s, label: s }));

  const active = page.items.filter((t) => (t.status as string) === "active").length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Teams"
        title="Teams"
        description="Every team registered under your org. You can add teams directly or let captains create them through the registration funnel."
        action={
          <Link
            href="/teams/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg transition-colors duration-fast ease-ease hover:bg-[var(--accent-hover)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New team
          </Link>
        }
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Roster"
          subtitle="Each team is owned by a captain and entered into a division per season. Open one to manage roster, lineups, and dues."
          meta={`${active} active · ${page.items.length} total`}
        />
        <div className="space-y-2">
          <UrlFilters
            searchPlaceholder="Search teams by name, short name or captain"
            selects={[
              { param: "sport", label: "Sport", allLabel: "All sports", options: sportOptions },
              {
                param: "status",
                label: "Status",
                allLabel: "All statuses",
                options: [
                  { value: "active", label: "Active" },
                  { value: "dissolved", label: "Dissolved" }
                ]
              }
            ]}
          />
          <p className="text-[12px] text-fg-muted">
            Showing {shown.length} of {page.items.length} teams
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {loadFailed ? (
            <div className="p-4">
              <Alert tone="error">
                Could not load teams. This is a server problem on our side, not your data. Reload to try again.
              </Alert>
            </div>
          ) : page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Network}
                title="No teams yet"
                description="Add a team here, or wait for captains to apply via the registration funnel."
              />
            </div>
          ) : shown.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Network}
                title="No teams match these filters"
                description="Clear the search or pick a different sport or status."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Short name</TH>
                  <TH>Sport</TH>
                  <TH>Captain</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium text-fg">
                      <Link href={`/teams/${t.id}`} className="hover:text-accent">
                        {t.name}
                      </Link>
                    </TD>
                    <TD className="font-mono text-[11px] text-fg-muted">{t.shortName ?? "—"}</TD>
                    <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">{t.sportCode}</TD>
                    <TD className="text-fg-muted">{t.captainName ?? "—"}</TD>
                    <TD>
                      <Badge status={t.status} />
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
