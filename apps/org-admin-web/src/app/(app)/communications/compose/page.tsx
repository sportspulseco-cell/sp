import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { fetchAll } from "@sportspulse/api-client";
import { EmptyState } from "@sportspulse/ui";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { ComposeForm, type ComposeTargets } from "./compose-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compose broadcast — Org admin" };

const empty = { items: [], nextCursor: null };

export default async function ComposePage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Compose" title="Send a broadcast" />
        <EmptyState
          icon={Building2}
          title="No org in scope"
          description="Pick an org from the switcher first."
        />
      </div>
    );
  }

  // The org's leagues, seasons, divisions and teams: the "Send to"
  // pickers list these, so an admin never types an id. Same reads as
  // the invoice composer.
  const [leaguesPage, seasonsPage, teamsPage] = await Promise.all([
    fetchAll((cursor) => leagueMgmt.listLeagues({ orgId, limit: 100, cursor })).catch(
      () => empty
    ),
    fetchAll((cursor) => leagueMgmt.listSeasons({ orgId, limit: 100, cursor })).catch(
      () => empty
    ),
    fetchAll((cursor) => leagueMgmt.listTeams({ orgId, limit: 100, cursor })).catch(
      () => empty
    )
  ]);
  const divisionLists = await Promise.all(
    seasonsPage.items.map((s) =>
      fetchAll((cursor) =>
        leagueMgmt.listDivisions({ seasonId: s.id, limit: 100, cursor })
      ).catch(() => empty)
    )
  );

  const leagueName = new Map(leaguesPage.items.map((l) => [l.id, l.name]));
  const seasonName = new Map(
    seasonsPage.items.map((s) => [
      s.id,
      `${leagueName.get(s.leagueId) ?? "League"} · ${s.name}`
    ])
  );
  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label);
  const targets: ComposeTargets = {
    league: leaguesPage.items.map((l) => ({ id: l.id, label: l.name })).sort(byLabel),
    season: seasonsPage.items
      .map((s) => ({ id: s.id, label: seasonName.get(s.id) ?? s.name }))
      .sort(byLabel),
    division: divisionLists
      .flatMap((p) =>
        p.items.map((d) => ({
          id: d.id,
          label: `${seasonName.get(d.seasonId) ?? "Season"} · ${d.name}`
        }))
      )
      .sort(byLabel),
    team: teamsPage.items.map((t) => ({ id: t.id, label: t.name })).sort(byLabel)
  };

  return (
    <div className="space-y-6">
      <Link
        href="/communications"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Outbox
      </Link>
      <PageHeader
        eyebrow="Compose"
        title="Send a broadcast"
        description="Send an announcement to people in the whole organisation or in one league, season, division or team."
      />
      <ComposeForm orgId={orgId} targets={targets} />
    </div>
  );
}
