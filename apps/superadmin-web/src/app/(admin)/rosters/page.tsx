import { fetchAll, load } from "@sportspulse/api-client";
import { Badge, LoadError, LocalDate, EmptyState, Eyebrow, PageHeader, TBody, TD, TH, THead, TR, Table, statusTone } from "@sportspulse/ui";
import { ListChecks, Network, Users, Activity } from "lucide-react";
import Link from "next/link";
import { iam, leagueMgmt, roster } from "@/lib/api/server-api";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { AddMembershipButton } from "@/components/rosters/add-membership-button";
import { DropMembershipButton } from "@/components/rosters/drop-membership-button";

export const metadata = { title: "Memberships · Super Admin" };

export default async function RostersPage({
  searchParams
}: {
  searchParams?: Promise<{
    teamId?: string;
    seasonId?: string;
    activeOnly?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeOnly = sp?.activeOnly !== "false";

  const [membershipsResult, teamsPage, personsPage, seasonsPage] = await Promise.all([
    // Every page: the list showed the first page as if it were all of it.
    load(
      fetchAll((cursor) =>
        roster.listMemberships({
          teamId: sp?.teamId,
          seasonId: sp?.seasonId,
          activeOnly,
          limit: 100,
          cursor
        })
      )
    ),
    fetchAll((cursor) => leagueMgmt.listTeams({ limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => iam.listPersons({ limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null }))
  ]);
  if (!membershipsResult.ok) {
    console.error("[rosters] listMemberships failed", membershipsResult.status, membershipsResult.message);
  }
  const memberships = membershipsResult.ok
    ? membershipsResult.data
    : { items: [], nextCursor: null };
  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  const personMap = new Map(
    personsPage.items.map((p) => [
      p.id,
      p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`
    ])
  );
  const seasonMap = new Map(
    seasonsPage.items.map((s) => [s.id, s.name])
  );

  const total = memberships.items.length;
  const active = memberships.items.filter(
    (m) => m.currentStatus === "active"
  ).length;
  const teamsCovered = new Set(memberships.items.map((m) => m.teamId)).size;
  const peopleCovered = new Set(memberships.items.map((m) => m.personId)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Teams"
        title="Rosters"
        description={
          activeOnly
            ? "Active roster memberships across every team. Add and drop players via roster moves. Moves are append-only, memberships are the projection."
            : "Every membership including released and historical."
        }
        action={
          <AddMembershipButton
            teams={teamsPage.items}
            persons={personsPage.items}
            seasons={seasonsPage.items}
          />
        }
      />

      <KineticStrip
        cards={[
          {
            label: "Memberships",
            value: total,
            icon: <ListChecks className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          },
          {
            label: "Active",
            value: active,
            icon: <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: active > 0 ? "ok" : "idle"
          },
          {
            label: "Teams covered",
            value: teamsCovered,
            icon: <Network className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          },
          {
            label: "Distinct players",
            value: peopleCovered,
            icon: <Users className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          }
        ]}
      />

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/rosters"
          className={
            activeOnly && !sp?.teamId && !sp?.seasonId
              ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
              : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
          }
        >
          Active only
        </Link>
        <Link
          href="/rosters?activeOnly=false"
          className={
            !activeOnly
              ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
              : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
          }
        >
          Include historical
        </Link>
      </div>

      {!membershipsResult.ok ? (
        <LoadError
          what="memberships"
          status={membershipsResult.status}
          message={membershipsResult.message}
        />
      ) : memberships.items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nobody rostered yet"
          description="Add a player to a team to populate the roster."
          action={
            <AddMembershipButton
              teams={teamsPage.items}
              persons={personsPage.items}
              seasons={seasonsPage.items}
            />
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Person</TH>
              <TH>Team</TH>
              <TH>Season</TH>
              <TH>Type</TH>
              <TH className="text-center">#</TH>
              <TH>Pos</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {memberships.items.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">
                  <Link
                    href={`/persons/${m.personId}`}
                    className="hover:underline"
                  >
                    {personMap.get(m.personId) ?? "Unknown player"}
                  </Link>
                </TD>
                <TD className="text-fg-muted">
                  {teamMap.get(m.teamId) ?? "Unnamed team"}
                </TD>
                <TD className="text-fg-muted">
                  {seasonMap.get(m.seasonId) ?? "Unknown season"}
                </TD>
                <TD>
                  <Badge mono>{m.membershipType.replace(/_/g, " ")}</Badge>
                </TD>
                <TD className="text-center font-mono tabular-nums text-fg">
                  {m.jerseyNumber ?? "—"}
                </TD>
                <TD className="font-mono text-[11px] uppercase text-fg-muted">
                  {m.positionCode ?? "—"}
                </TD>
                <TD>
                  <Badge status={m.currentStatus} />
                </TD>
                <TD className="text-right">
                  {m.currentStatus === "active" ? (
                    <DropMembershipButton
                      teamId={m.teamId}
                      personId={m.personId}
                      seasonId={m.seasonId}
                    />
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Recent moves footer */}
      <RecentMovesCard
        teamMap={teamMap}
        personMap={personMap}
        teamId={sp?.teamId}
      />
    </div>
  );
}

async function RecentMovesCard({
  teamMap,
  personMap,
  teamId
}: {
  teamMap: Map<string, string>;
  personMap: Map<string, string>;
  teamId?: string;
}) {
  const moves = await roster
    .listMoves({ teamId })
    .catch(() => ({ items: [], nextCursor: null }));

  if (moves.items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <Eyebrow>Recent roster moves</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Append-only event log · {moves.items.length} entries
          </p>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {moves.items.slice(0, 10).map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-4 px-6 py-3"
          >
            <span className="w-24 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              {m.moveType.replace(/_/g, " ")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">
                <span className="font-medium">
                  {personMap.get(m.personId) ?? "Unknown player"}
                </span>
                <span className="ml-2 text-fg-muted">
                  {m.moveType === "add" || m.moveType === "trade_in" || m.moveType === "call_up"
                    ? "→"
                    : "✕"}{" "}
                  {teamMap.get(m.teamId) ?? "Unnamed team"}
                </span>
                {m.jerseyNumber !== null ? (
                  <span className="ml-2 font-mono text-[11px] text-fg-muted">
                    #{m.jerseyNumber}
                  </span>
                ) : null}
              </p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              <LocalDate iso={m.effectiveAt} format="dateTime" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
