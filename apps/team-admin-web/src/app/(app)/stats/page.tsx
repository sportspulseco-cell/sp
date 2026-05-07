import { ChartBar } from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { Standing } from "@sportspulse/api-client";
import { iam, leagueMgmt, stats } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats - Team Admin" };

export default async function TeamAdminStatsPage() {
  const scope = await iam.meScope().catch(() => null);
  const teamId = scope?.teamIds[0] ?? null;

  if (!teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Stats" title="Stats" />
        <EmptyState icon={ChartBar} title="No team in scope" description="You need a team_admin or coach role on a team to see its stats." />
      </div>
    );
  }

  // Find any membership to get the seasonId, then derive league for standings.
  // Limited but works for the team_admin's primary team. League-wide stats
  // are exposed via the super-admin console.
  let standings: Standing[] = [];
  let leagueId: string | null = null;
  try {
    const team = await leagueMgmt.getTeam(teamId);
    // Team has orgId, not leagueId directly; pull standings via the
    // first season the team participates in. Cheap workaround until
    // teams.leagueId is exposed on the SDK (paper cut on the roadmap).
    const seasonsPage = await leagueMgmt.listSeasons({ orgId: team.orgId });
    if (seasonsPage.items[0]) {
      leagueId = seasonsPage.items[0].leagueId ?? null;
      if (leagueId) {
        standings = await stats.standings(leagueId).catch(() => [] as Standing[]);
      }
    }
  } catch {
    // fallback to empty list - the empty state below kicks in
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Stats"
        title="Stats"
        description="Division standings + team-wide stats. Per-player breakdowns live on each player's dashboard."
      />
      {standings.length === 0 ? (
        <EmptyState icon={ChartBar} title="No stats yet" description="Standings appear once finalised games hit the scoresheet." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Team</TH>
              <TH className="text-right">W</TH>
              <TH className="text-right">L</TH>
              <TH className="text-right">T</TH>
              <TH className="text-right">PTS</TH>
            </TR>
          </THead>
          <TBody>
            {standings.map((s: Standing) => {
              const mine = s.teamId === teamId;
              return (
                <TR key={s.id} className={mine ? "bg-blue-500/5" : undefined}>
                  <TD className="font-mono tabular-nums text-fg-muted">{s.rank ?? "-"}</TD>
                  <TD className={mine ? "font-semibold text-blue-600 dark:text-blue-400" : "text-fg"}>
                    <span className="font-mono uppercase">{s.teamId.slice(0, 8)}</span>
                    {mine ? " <-" : ""}
                  </TD>
                  <TD className="text-right font-mono tabular-nums">{s.w}</TD>
                  <TD className="text-right font-mono tabular-nums">{s.l}</TD>
                  <TD className="text-right font-mono tabular-nums">{s.t}</TD>
                  <TD className="text-right font-mono tabular-nums font-semibold">{s.points}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
