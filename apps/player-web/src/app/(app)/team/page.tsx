import { Clock, UsersRound } from "lucide-react";
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
import type { Standing, TeamMembership } from "@sportspulse/api-client";
import { iam, leagueMgmt, registration, roster, stats } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { JoinTeamButton } from "./join-team-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team — SportsPulse" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default async function TeamPage() {
  const scope = await iam.meScope().catch(() => null);
  const myTeamId = scope?.teamIds[0] ?? null;
  const myPersonId = scope?.personId ?? null;

  if (!myTeamId) {
    // Player has no team yet. Pull their open applications + the teams
    // they can apply to (derived from their approved registrations).
    type JoinableTeam = Awaited<
      ReturnType<typeof registration.listJoinableTeams>
    >["items"][number];
    type JoinRequest = Awaited<
      ReturnType<typeof registration.listMyJoinRequests>
    >["items"][number];
    const [joinable, joinRequests] = await Promise.all([
      registration
        .listJoinableTeams()
        .catch(() => ({ items: [] as JoinableTeam[] })),
      registration
        .listMyJoinRequests()
        .catch(() => ({ items: [] as JoinRequest[] }))
    ]);

    const pending = joinRequests.items.filter((r) => r.status === "pending");

    // Group joinable teams by division for a clean section per
    // registration the player has open.
    const byDivision = new Map<
      string,
      {
        divisionId: string;
        divisionName: string;
        divisionTier: string | null;
        seasonName: string;
        orgName: string | null;
        teams: typeof joinable.items;
      }
    >();
    for (const t of joinable.items) {
      const group = byDivision.get(t.divisionId);
      if (group) {
        group.teams.push(t);
      } else {
        byDivision.set(t.divisionId, {
          divisionId: t.divisionId,
          divisionName: t.divisionName,
          divisionTier: t.divisionTier,
          seasonName: t.seasonName,
          orgName: t.orgName,
          teams: [t]
        });
      }
    }

    const hasAnything = pending.length > 0 || byDivision.size > 0;

    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Team"
          title="Team"
          description="Roster + division standings."
        />

        {pending.length > 0 ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
            <Eyebrow>// awaiting captain approval</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {pending.length} application{pending.length === 1 ? "" : "s"} sitting in a captain&apos;s inbox.
            </p>
            <ul className="mt-3 space-y-2">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-fg">
                      {p.teamName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-fg-muted">
                      {p.orgName ?? "—"} · applied {fmtDate(p.appliedAt)}
                    </p>
                  </div>
                  <Badge mono tone="warning">
                    <Clock className="mr-1 h-3 w-3" strokeWidth={1.75} />
                    pending
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {byDivision.size > 0 ? (
          Array.from(byDivision.values()).map((group) => (
            <section
              key={group.divisionId}
              className="rounded-xl border border-border bg-surface-1"
            >
              <header className="border-b border-border px-5 py-3">
                <Eyebrow>// teams accepting players</Eyebrow>
                <p className="mt-1 text-[14px] font-medium text-fg">
                  {group.divisionName}
                  {group.divisionTier ? (
                    <span className="ml-1 text-fg-muted">· {group.divisionTier}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[11px] text-fg-muted">
                  {group.orgName ?? "—"} · {group.seasonName}
                </p>
              </header>
              <ul className="divide-y divide-border">
                {group.teams.map((t) => (
                  <li
                    key={t.teamId}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-fg">
                        {t.teamName}
                      </p>
                      {t.teamShortName ? (
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                          {t.teamShortName}
                        </p>
                      ) : null}
                    </div>
                    <JoinTeamButton
                      teamId={t.teamId}
                      teamName={t.teamName}
                      seasonId={t.seasonId}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : null}

        {!hasAnything ? (
          <EmptyState
            icon={UsersRound}
            title="Not on a roster yet"
            description="Register for an open season (Open registrations in the sidebar) and once approved you'll see teams here to apply to."
          />
        ) : null}
      </div>
    );
  }

  const [team, membershipsPage] = await Promise.all([
    leagueMgmt.getTeam(myTeamId).catch(() => null),
    roster
      .listMemberships({ teamId: myTeamId, activeOnly: true })
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  // Standings need a leagueId — derive from any of the team's games
  // (we don't have a direct team→league lookup yet). For now fall back
  // to no standings if we can't infer.
  // TODO(roadmap): expose teams.leagueId on the SDK so we don't have
  // to derive it.
  const memberships: TeamMembership[] = membershipsPage.items;

  // Fetch standings once we know the league. We'll use the first
  // membership row's seasonId as a hint.
  const seasonId = memberships[0]?.seasonId ?? null;
  let standings: Standing[] = [];
  if (seasonId) {
    const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
    if (season?.leagueId) {
      standings = await stats
        .standings(season.leagueId)
        .catch(() => [] as Standing[]);
    }
  }

  // Find captain by jersey number / position label heuristic — we
  // don't have an explicit `is_captain` flag yet on memberships, so
  // we don't show the C badge until that ships. Spec mentions amber C
  // badge; defer until schema lands.

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Team"
        title={team?.name ?? "Your team"}
        description={
          team?.sportCode
            ? `${team.sportCode.toUpperCase()} · ${team.shortName ?? team.name}`
            : "Roster + standings."
        }
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Roster */}
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>// Roster</Eyebrow>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {memberships.length} active
            </span>
          </header>
          {memberships.length === 0 ? (
            <div className="px-5 py-6 text-[13px] text-fg-muted">
              Empty roster.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {memberships.map((m: TeamMembership) => {
                const isMe = m.personId === myPersonId;
                const initials = m.personId.slice(0, 2).toUpperCase();
                return (
                  <li
                    key={m.id}
                    className={
                      "flex items-center justify-between gap-3 px-5 py-3 " +
                      (isMe ? "bg-blue-500/5" : "")
                    }
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-medium " +
                          (isMe
                            ? "bg-blue-500 text-white"
                            : "bg-surface-2 text-fg-muted")
                        }
                      >
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-fg">
                          <span className="font-mono uppercase">
                            {m.personId.slice(0, 8)}
                          </span>
                          {isMe ? (
                            <Badge mono tone="info">
                              you
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-fg-muted">
                          {m.positionCode ?? "—"}
                          {m.jerseyNumber ? ` · #${m.jerseyNumber}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge mono tone="neutral">
                      {m.membershipType}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Standings */}
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>// Standings</Eyebrow>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {standings.length} teams
            </span>
          </header>
          {standings.length === 0 ? (
            <div className="px-5 py-6 text-[13px] text-fg-muted">
              Standings appear once games are played.
            </div>
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
                  const mine = s.teamId === myTeamId;
                  return (
                    <TR
                      key={s.id}
                      className={mine ? "bg-blue-500/5" : undefined}
                    >
                      <TD className="font-mono tabular-nums text-fg-muted">
                        {s.rank ?? "—"}
                      </TD>
                      <TD
                        className={
                          mine
                            ? "font-semibold text-blue-600 dark:text-blue-400"
                            : "text-fg"
                        }
                      >
                        <span className="font-mono uppercase">
                          {s.teamId.slice(0, 8)}
                        </span>
                        {mine ? " ←" : ""}
                      </TD>
                      <TD className="text-right font-mono tabular-nums">
                        {s.w}
                      </TD>
                      <TD className="text-right font-mono tabular-nums">
                        {s.l}
                      </TD>
                      <TD className="text-right font-mono tabular-nums">
                        {s.t}
                      </TD>
                      <TD className="text-right font-mono tabular-nums font-semibold">
                        {s.points}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
