import { fetchAll } from "@sportspulse/api-client";
import { Alert } from "@sportspulse/ui";
import { Network, Building2, Layers, Trophy, Plus } from "lucide-react";
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
import type { Team } from "@/lib/api/types";

export const metadata = { title: "Teams — SportsPulse" };

export default async function TeamsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; org?: string; sport?: string; status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  let loadFailed = false;
  const teams = await fetchAll((cursor) => leagueMgmt.listTeams({ limit: 100, cursor })).catch(
    (e) => {
      // Show the failure; an empty list here read as "No teams yet".
      console.error("[teams] listTeams failed", e);
      loadFailed = true;
      return { items: [] as Team[] };
    }
  );

  // Filter options come from the rows themselves, by name.
  const orgOptions = [
    ...new Map(
      teams.items
        .filter((t) => t.ownerOrgName)
        .map((t) => [t.orgId, t.ownerOrgName!] as const)
    ).entries()
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const sportOptions = [...new Set(teams.items.map((t) => t.sportCode))]
    .sort()
    .map((s) => ({ value: s, label: s }));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = teams.items.filter((t) => {
    if (q) {
      const hay = `${t.name} ${t.shortName ?? ""} ${t.ownerOrgName ?? ""} ${t.captainName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (sp.org && t.orgId !== sp.org) return false;
    if (sp.sport && t.sportCode !== sp.sport) return false;
    if (sp.status && t.status !== sp.status) return false;
    return true;
  });

  const total = teams.items.length;
  const active = teams.items.filter((t) => t.status === "active").length;
  const orgsCovered = new Set(teams.items.map((t) => t.orgId)).size;
  const sports = new Set(teams.items.map((t) => t.sportCode)).size;

  const newTeamCta = (
    <Link
      href="/teams/new"
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.02]"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
      New team
    </Link>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="rosters"
        title="Teams"
        description="Owned by clubs/orgs. Enter divisions via DivisionTeamEntry."
        action={newTeamCta}
      />
      <KineticStrip
        cards={[
          { label: "Total teams", value: total, icon: <Network className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          {
            label: "Active",
            value: active,
            icon: <Trophy className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: active > 0 ? "ok" : "idle"
          },
          {
            label: "Owner orgs",
            value: orgsCovered,
            icon: <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          },
          { label: "Sports", value: sports, icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" }
        ]}
      />

      <div className="space-y-2">
        <UrlFilters
          searchPlaceholder="Search teams by name, short name, organisation or captain"
          selects={[
            { param: "org", label: "Organisation", allLabel: "All organisations", options: orgOptions },
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
          Showing {shown.length} of {total} teams
        </p>
      </div>

      {loadFailed ? (
        <Alert tone="error">
          Could not load teams. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : total === 0 ? (
        <EmptyState
          icon={Network}
          title="No teams yet"
          description="Teams are owned by an organization and enter divisions for play."
          action={newTeamCta}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No teams match these filters"
          description="Clear the search or pick a different organisation, sport or status."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Short name</TH>
              <TH>Sport</TH>
              <TH>Owner org</TH>
              <TH>Status</TH>
              <TH>Captain / admins</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">
                  <Link href={`/teams/${t.id}`} className="hover:underline">
                    {t.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">{t.shortName ?? "—"}</TD>
                <TD className="text-muted-foreground">{t.sportCode}</TD>
                <TD>
                  <Link
                    href={`/organizations/${t.orgId}`}
                    className="inline-flex items-center gap-1 text-fg-muted hover:text-fg hover:underline"
                  >
                    <Building2 className="h-3 w-3" strokeWidth={1.75} />
                    {t.ownerOrgName ?? "Unknown org"}
                  </Link>
                </TD>
                <TD>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="team"
                    scopeId={t.id}
                    resourceLabel={t.name}
                    allowedRoleCodes={["captain", "coach"]}
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
