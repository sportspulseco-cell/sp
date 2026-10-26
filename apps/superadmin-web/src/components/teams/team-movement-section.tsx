import { fetchAll } from "@sportspulse/api-client";
import { ArrowRightLeft } from "lucide-react";
import { leagueMgmt, orgs, teamMovement } from "@/lib/api/server-api";
import { Eyebrow, IconTile } from "@sportspulse/ui";
import { TeamMovementPanel } from "./team-movement-panel";

/**
 * Server wrapper for the team movement panel (PPHL item 8): loads the
 * team's season instances, its movement history and the pickers' data
 * (seasons and leagues of the org, orgs for a super admin) so the client
 * panel never shows an id where a name belongs.
 */
export async function TeamMovementSection({
  teamId,
  teamName,
  orgId
}: {
  teamId: string;
  teamName: string;
  orgId: string;
}) {
  const [entries, history, seasons, leagues, orgList] = await Promise.all([
    teamMovement.entries(teamId).catch(() => ({ items: [] })),
    teamMovement.history(teamId).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt.listSeasons({ orgId, limit: 100, cursor })).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt.listLeagues({ orgId, limit: 100, cursor })).catch(() => ({ items: [] })),
    // Org admins cannot list other orgs; an empty list hides the org move.
    fetchAll((cursor) => orgs.list({ limit: 100, cursor })).catch(() => ({ items: [] }))
  ]);

  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-start gap-3 border-b border-border px-6 py-4">
        <IconTile icon={ArrowRightLeft} tint="cyan" size="sm" />
        <div className="flex-1">
          <Eyebrow>Seasons &amp; divisions</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
            Where {teamName} plays, season by season
          </p>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Each row is one season instance of the team. Moving the team never changes past
            seasons; it closes the current instance and opens a new one.
          </p>
        </div>
      </header>
      <div className="px-6 py-5">
        <TeamMovementPanel
          teamId={teamId}
          teamName={teamName}
          orgId={orgId}
          initialEntries={entries.items}
          initialHistory={history.items}
          seasons={seasons.items.map((s) => ({
            id: s.id,
            name: s.name,
            leagueId: s.leagueId,
            status: s.status,
            startDate: s.startDate
          }))}
          leagues={leagues.items.map((l) => ({ id: l.id, name: l.name }))}
          orgs={orgList.items.map((o) => ({ id: o.id, name: o.displayName }))}
        />
      </div>
    </section>
  );
}
