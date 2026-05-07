import {
  CalendarRange,
  ClipboardList,
  ExternalLink,
  Trophy,
  Users,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import {
  Badge,
  Eyebrow,
  EmptyState,
  IconTile,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { gameOps, iam, leagueMgmt, roster } from "@/lib/api/server-api";

export const dynamic = "force-dynamic";

const SUPERADMIN_URL =
  process.env.NEXT_PUBLIC_SUPERADMIN_URL ?? "https://sp-superadmin.vercel.app";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function TeamAdminHome() {
  const scope = await iam.meScope().catch(() => null);
  const myTeamId = scope?.teamIds[0] ?? null;

  if (!scope || !myTeamId) {
    return (
      <ShellWithoutTeam
        message={
          scope
            ? "Your account isn't on a team roster yet. Ask your league admin to add you to a team as team_admin or coach."
            : "We couldn't load your account. Try signing out and back in."
        }
      />
    );
  }

  const team = await leagueMgmt.getTeam(myTeamId).catch(() => null);

  const [membershipsPage, movesPage, gamesPage] = await Promise.all([
    roster
      .listMemberships({ teamId: myTeamId, activeOnly: true })
      .catch(() => ({ items: [], nextCursor: null })),
    roster
      .listMoves({ teamId: myTeamId })
      .catch(() => ({ items: [], nextCursor: null })),
    gameOps
      .listGames({ teamId: myTeamId, limit: 10 })
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  const now = Date.now();
  const upcoming = gamesPage.items
    .filter((g) => new Date(g.scheduledStartTsUtc).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduledStartTsUtc).getTime() -
        new Date(b.scheduledStartTsUtc).getTime()
    );
  const nextGame = upcoming[0];

  const activeRoster = membershipsPage.items.filter(
    (m) => m.currentStatus === "active"
  );

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-12 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div className="space-y-2">
          <Eyebrow>// sp-team-admin</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-tight tracking-tighter text-fg">
            {team?.name ?? "Your team"}
          </h1>
          <p className="text-[14px] text-fg-muted">
            Roster, lineups, and what's next on the schedule.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${SUPERADMIN_URL}/teams/${myTeamId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            Manage roster
            <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
          </a>
        </div>
      </header>

      {/* KPI tiles */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Users}
          label="Active roster"
          value={String(activeRoster.length)}
          hint={`${membershipsPage.items.length} memberships total`}
          tint="blue"
        />
        <Kpi
          icon={CalendarRange}
          label="Upcoming games"
          value={String(upcoming.length)}
          hint={
            nextGame
              ? `Next: ${fmtDateTime(nextGame.scheduledStartTsUtc)}`
              : "Nothing scheduled"
          }
          tint="violet"
        />
        <Kpi
          icon={ClipboardList}
          label="Roster moves"
          value={String(movesPage.items.length)}
          hint="Adds / drops on file"
          tint="amber"
        />
        <Kpi
          icon={Trophy}
          label="Sport"
          value={(team?.sportCode ?? "—").toUpperCase()}
          hint={team?.shortName ?? team?.name ?? ""}
          tint="emerald"
        />
      </section>

      {/* Roster */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Roster</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Active memberships on {team?.name ?? "this team"}.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            {activeRoster.length} active
          </span>
        </header>
        {activeRoster.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="Empty roster"
            description="Once players are added to this team, they'll show up here. Add players from the SportsPulse super-admin console."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH>#</TH>
                <TH>Position</TH>
                <TH>Type</TH>
                <TH>Effective from</TH>
              </TR>
            </THead>
            <TBody>
              {activeRoster.map((m) => (
                <TR key={m.id}>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {m.personId.slice(0, 8)}
                  </TD>
                  <TD className="font-mono tabular-nums text-fg">
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
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Schedule */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Upcoming games</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              The next 10 scheduled games for this team.
            </p>
          </div>
        </header>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No games scheduled"
            description="Once a season is in progress, games will appear here as they're scheduled."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Opponent</TH>
                <TH>Venue</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {upcoming.slice(0, 10).map((g) => {
                const isHome = g.homeTeamId === myTeamId;
                const oppId = isHome ? g.awayTeamId : g.homeTeamId;
                return (
                  <TR key={g.id}>
                    <TD className="text-fg">{fmtDateTime(g.scheduledStartTsUtc)}</TD>
                    <TD className="font-mono text-[11px] text-fg-muted">
                      {isHome ? "vs " : "@ "}
                      {oppId.slice(0, 8)}
                    </TD>
                    <TD className="text-fg-muted">{g.venueName ?? "—"}</TD>
                    <TD>
                      <Badge mono tone={g.status === "scheduled" ? "info" : "neutral"}>
                        {g.status.replace(/_/g, " ")}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
    </main>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tint
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tint: "blue" | "violet" | "amber" | "rose" | "emerald" | "cyan" | "neutral";
}) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        <IconTile icon={Icon} tint={tint} size="sm" />
      </div>
      <p className="mt-5 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-1 truncate text-[12px] text-fg-muted">{hint}</p>
    </div>
  );
}

function ShellWithoutTeam({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-16">
      <Eyebrow>// sp-team-admin</Eyebrow>
      <h1 className="text-[36px] font-semibold tracking-tighter text-fg">
        Team Admin
      </h1>
      <EmptyState
        icon={UsersRound}
        title="No team yet"
        description={message}
      />
    </main>
  );
}
