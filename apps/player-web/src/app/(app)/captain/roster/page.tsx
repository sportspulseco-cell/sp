import { Star, Users, UserMinus } from "lucide-react";
import {
  Badge,
  EmptyState,
  Eyebrow,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { TeamMembership } from "@sportspulse/api-client";
import { iam, leagueMgmt, roster } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { DropPlayerButton } from "./drop-player-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Manage roster — SportsPulse" };

export default async function CaptainRosterPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  if (!isCaptain) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Captain console"
          title="Manage roster"
        />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="Ask your league admin to assign captain to your account."
        />
      </div>
    );
  }

  const myTeamId = scope!.teamIds[0] ?? null;
  if (!myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Captain console"
          title="Manage roster"
        />
        <EmptyState
          icon={Users}
          title="No team in scope"
          description="You hold the captain role but no team is currently scoped. Contact your league admin."
        />
      </div>
    );
  }

  const [team, membershipsPage] = await Promise.all([
    leagueMgmt.getTeam(myTeamId).catch(() => null),
    roster
      .listMemberships({ teamId: myTeamId, activeOnly: true })
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  const memberships: TeamMembership[] = membershipsPage.items;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Manage roster"
        description={`Active roster for ${team?.name ?? "your team"}. Drop a player to remove them; add new players via Invites.`}
      />

      {memberships.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Empty roster"
          description="No active memberships yet. Use the Invites page to bring players onto your team."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>// Roster</Eyebrow>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {memberships.length} active
            </span>
          </header>
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH className="text-right">#</TH>
                <TH>Position</TH>
                <TH>Type</TH>
                <TH>Effective from</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {memberships.map((m: TeamMembership) => (
                <TR key={m.id}>
                  <TD className="font-mono text-[11px] uppercase">
                    {m.personId.slice(0, 8)}
                  </TD>
                  <TD className="text-right font-mono tabular-nums">
                    {m.jerseyNumber ?? "—"}
                  </TD>
                  <TD className="text-fg-muted">{m.positionCode ?? "—"}</TD>
                  <TD>
                    <Badge mono tone="neutral">
                      {m.membershipType}
                    </Badge>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {new Date(m.effectiveFrom).toLocaleDateString()}
                  </TD>
                  <TD className="text-right">
                    <DropPlayerButton
                      teamId={myTeamId}
                      personId={m.personId}
                      seasonId={m.seasonId}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        // To add a player, send them an invite from the{" "}
        <a href="/captain/invites" className="text-accent hover:underline">
          Invites
        </a>{" "}
        page or claim from{" "}
        <a href="/captain/free-agents" className="text-accent hover:underline">
          Free agents
        </a>
        .
      </p>

      <div className="hidden">
        {/* keep import referenced */}
        <UserMinus />
      </div>
    </div>
  );
}
