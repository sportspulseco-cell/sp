import { formatMoney, registrationClosesLabel, DATE_FORMATS, formatCalendarDate, formatInZone } from "@sportspulse/kernel";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Bell, CalendarRange, Check, ClipboardList, Clock, Compass, ExternalLink, MapPin, Trophy, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { Badge, EmptyState, Eyebrow, IconTile, PageHeader, LocalDate, TodoList, type TodoItem } from "@sportspulse/ui";
import type { Game, Notification, Registration } from "@sportspulse/api-client";
import { captain, communications, finance, gameOps, iam, leagueMgmt, loadMeScope, publicRegistration, registration, roster, subs } from "@/lib/api/server-api";
import { TeamOffersCard } from "@/components/team-offers-card";
import { SubRequestsCard } from "@/components/sub-requests-card";
import { detectRegistrationState, stoppedAtLabel } from "./registration-state-banner";
import { CaptainConsoleBanner } from "@/components/captain-console-banner";
import { iconFor, noticeAt, tintFor, titleOf } from "./notifications/notice-format";

type MyInvoice = Awaited<ReturnType<typeof finance.myInvoices>>["items"][number];

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ----------------------------- helpers ----------------------------- */

// In the game's own zone.
function fmtDateTime(iso: string, tz: string): string {
  return formatInZone(iso, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

// Due dates are calendar days.
function fmtDate(value: string): string {
  return formatCalendarDate(value, DATE_FORMATS.monthDay);
}

function relativeTime(iso: string, now: Date): ReactNode {
  const diff = now.getTime() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "Just now";
  if (abs < hour) return `${Math.floor(abs / minute)} min ago`;
  if (abs < day) return `${Math.floor(abs / hour)} h ago`;
  if (abs < 7 * day) return `${Math.floor(abs / day)} d ago`;
  return <LocalDate iso={iso} format="monthDay" />;
}

function countdown(iso: string, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  if (diff < 0) return "In progress";
  const days = Math.floor(diff / day);
  if (days >= 2) return `${days} days away`;
  if (days >= 1) return "Tomorrow";
  const hours = Math.floor(diff / hour);
  const mins = Math.floor((diff % hour) / minute);
  return `Today, ${hours}h ${mins}m away`;
}

/* ------------------------------ page ------------------------------- */

export default async function PlayerHome() {
  const now = new Date();

  const [profile, scope] = await Promise.all([
    iam.me().catch(() => null),
    loadMeScope()
  ]);

  if (!profile || !scope) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Account not loaded"
        description="Try signing out and back in."
      />
    );
  }

  const myTeamId = scope.teamIds[0] ?? null;
  const team = myTeamId
    ? await leagueMgmt.getTeam(myTeamId).catch(() => null)
    : null;

  // Open registrations scoped to the player's own orgs (server-side
  // filter via scope.orgIds). Prevents the cross-tenant leak the
  // anonymous /public/registration/open endpoint exposes when called
  // from a signed-in surface.
  const openRegs = await fetchOpenRegistrations();

  // Single batch — Home view fetches everything in parallel.
  const [gamesPage, regPage, invoicesPage, notifsPage, membershipsPage, myInvites, mySubRequests] =
    await Promise.all([
      myTeamId
        ? gameOps
            .listGames({ teamId: myTeamId, limit: 30 })
            .catch(() => ({ items: [], nextCursor: null }))
        : Promise.resolve({ items: [], nextCursor: null }),
      // Self-scoped endpoint — JwtAuthGuard only, returns the caller's
      // own registrations (including the legacy-orphan heal-on-read).
      // The admin `listRegistrations({subjectPersonId})` variant is
      // SuperAdminGuard'd and 403s every non-super-admin player.
      registration
        .listMyRegistrations()
        .catch(() => ({ items: [] })),
      // Player-scoped endpoints; the admin list endpoints 403 for players.
      finance.myInvoices().catch(() => ({ items: [] as MyInvoice[] })),
      communications
        .myNotifications({ limit: 10 })
        .catch(() => ({ items: [], nextCursor: null })),
      myTeamId
        ? roster
            .listMemberships({ teamId: myTeamId, activeOnly: true })
            .catch(() => ({ items: [], nextCursor: null }))
        : Promise.resolve({ items: [], nextCursor: null }),
      // Team offers / invites waiting for this player's answer (CAP-9).
      captain.myInvites().catch(() => ({ items: [] })),
      // Captains asking this player to sub for one game (UC-31).
      subs.mine().catch(() => ({ items: [] }))
    ]);

  // -- Next game (chronologically earliest future scheduled game) --
  const games: Game[] = gamesPage.items;
  const upcoming = games
    .filter(
      (g: Game) =>
        new Date(g.scheduledStartTsUtc).getTime() >= now.getTime() &&
        g.status !== "completed" &&
        g.status !== "cancelled"
    )
    .sort(
      (a: Game, b: Game) =>
        new Date(a.scheduledStartTsUtc).getTime() -
        new Date(b.scheduledStartTsUtc).getTime()
    );
  const nextGame: Game | undefined = upcoming[0];

  // -- Recent results (last 4 finals) --
  const recent = games
    .filter((g: Game) => g.status === "completed")
    .sort(
      (a: Game, b: Game) =>
        new Date(b.scheduledStartTsUtc).getTime() -
        new Date(a.scheduledStartTsUtc).getTime()
    )
    .slice(0, 4);

  // Resolve opponent team names for next-game + recent-games rows
  // (BUG-037). Fan out one getTeam per unique opponent across the
  // dashboard's visible games — small bounded set.
  const opponentIdSet = new Set<string>();
  if (nextGame && myTeamId) {
    const id =
      nextGame.homeTeamId === myTeamId ? nextGame.awayTeamId : nextGame.homeTeamId;
    if (id) opponentIdSet.add(id);
  }
  for (const g of recent) {
    const id = g.homeTeamId === myTeamId ? g.awayTeamId : g.homeTeamId;
    if (id) opponentIdSet.add(id);
  }
  const opponentNameEntries = await Promise.all(
    Array.from(opponentIdSet).map(
      async (id) =>
        [id, await leagueMgmt.getTeamSummary(id).catch(() => null)] as const
    )
  );
  const opponentNames = new Map<string, string>();
  for (const [id, t] of opponentNameEntries) {
    if (t?.name) opponentNames.set(id, t.name);
  }

  // -- Team record from finals (we don't pull standings here to keep
  //    the home view to a single batch — Stats view pulls those) --
  const record = recent.reduce(
    (acc: { w: number; l: number; t: number }, g: Game) => {
      if (g.homeScore == null || g.awayScore == null) return acc;
      const isHome = g.homeTeamId === myTeamId;
      const us = isHome ? g.homeScore : g.awayScore;
      const them = isHome ? g.awayScore : g.homeScore;
      if (us > them) acc.w += 1;
      else if (us < them) acc.l += 1;
      else acc.t += 1;
      return acc;
    },
    { w: 0, l: 0, t: 0 }
  );

  // -- AR snapshot --
  const allInvoices: MyInvoice[] = invoicesPage.items;
  const openInvoices = allInvoices.filter(
    (i: MyInvoice) => i.status !== "void" && i.totalCents > i.paidCents
  );
  const nextInvoice = openInvoices[0];
  const balanceCents = openInvoices.reduce(
    (a: number, i: MyInvoice) => a + Math.max(0, i.totalCents - i.paidCents),
    0
  );
  const overdue = openInvoices.some((i: MyInvoice) => i.status === "overdue");
  const currency = allInvoices[0]?.currency ?? "USD";

  // -- Notifications preview (3 most recent) --
  const recentNotifs = notifsPage.items.slice(0, 3);

  // -- Roster size for "season points" approximation in stat bars --
  const teammates = membershipsPage.items.length;

  // Greet by name only: an account with no name on file used to be
  // greeted by its email address ("Hey jane+test@gmail.com.").
  const firstName = (profile.legalFirstName || profile.preferredName || "").trim().split(/\s+/)[0] ?? "";

  // "Needs you": every open task, one button each (doc/design/guided-ui.md).
  const todo: TodoItem[] = [];
  const regState = detectRegistrationState(regPage.items, !!team);
  if (regState.kind === "in_progress")
    todo.push({
      icon: Clock,
      tone: "warn",
      label: `Resume your registration · ${stoppedAtLabel(regState.registration.status as string)}`,
      action: "Resume",
      href: `/register?resume=${regState.registration.id}`
    });
  else if (regState.kind === "new")
    todo.push({ icon: UserPlus, label: "Register for a season to join a team", action: "Register", href: "/register" });
  else if (regState.kind === "returning")
    todo.push({ icon: CalendarRange, label: "A new season is open", action: "Register", href: "/register" });
  if (balanceCents > 0)
    todo.push({
      icon: Wallet,
      tone: overdue ? "warn" : "default",
      label: `${formatMoney(balanceCents, currency)} to pay${overdue ? " · overdue" : nextInvoice?.dueAt ? ` · due ${fmtDate(nextInvoice.dueAt)}` : ""}`,
      action: "Pay",
      href: "/payments"
    });
  if (regState.kind !== "new" && regState.kind !== "returning")
    for (const r of openRegs.slice(0, 2))
      todo.push({
        icon: CalendarRange,
        label: `${r.seasonName} is open${registrationClosesLabel(r.registrationClosesAt) ? ` · ${registrationClosesLabel(r.registrationClosesAt)}` : ""}`,
        action: "Sign up",
        href: `/register/${r.seasonId}`
      });
  const unread = notifsPage.items.filter((n) => !n.readAt).length;
  if (unread > 0)
    todo.push({
      icon: Bell,
      label: `${unread} new ${unread === 1 ? "message" : "messages"}`,
      action: "Read",
      href: "/notifications"
    });

  return (
    <div className="space-y-8">
      <PageHeader title={firstName ? `Hey ${firstName}.` : "Welcome."} />

      {/* Decisions waiting on the player: a team offer, a sub request. */}
      <TeamOffersCard items={myInvites.items} />
      <SubRequestsCard items={mySubRequests.items} />

      <TodoList items={todo} doneText="You're all set." />

      <NextGameHero
        nextGame={nextGame}
        teamId={myTeamId}
        teamName={team?.name ?? "Your team"}
        opponentNames={opponentNames}
      />

      <RecentGamesCard recent={recent} myTeamId={myTeamId} opponentNames={opponentNames} />

      {/* Captains run their team in the team app. */}
      {scope.roleCodes.includes("captain") && <CaptainConsoleBanner />}
    </div>
  );
}

/* ---------------------------- next-game ---------------------------- */

function NextGameHero({
  nextGame,
  teamId,
  teamName,
  opponentNames
}: {
  nextGame: Game | undefined;
  teamId: string | null;
  teamName: string;
  opponentNames: Map<string, string>;
}) {
  if (!nextGame) {
    return (
      <section className="rounded-xl bg-accent p-6 text-accent-fg">
        <Eyebrow className="!text-accent-fg opacity-80">Next game</Eyebrow>
        <p className="mt-3 text-[20px] font-semibold tracking-tight">
          Nothing scheduled
        </p>
        <p className="mt-1 text-[13px] text-accent-fg/75">
          When the league publishes games for {teamName}, they'll show up here.
        </p>
      </section>
    );
  }

  const isHome = nextGame.homeTeamId === teamId;
  const opponent = isHome ? nextGame.awayTeamId : nextGame.homeTeamId;
  const now = new Date();

  return (
    <section className="rounded-xl bg-accent p-6 text-accent-fg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <Eyebrow className="!text-accent-fg opacity-80">Next game</Eyebrow>
          <p className="text-[22px] font-semibold tracking-tight">
            {teamName} <span className="text-accent-fg/80">vs.</span>{" "}
            <span>{opponentNames.get(opponent) ?? "Unnamed team"}</span>
          </p>
          <p className="flex items-center gap-2 text-[13px] text-accent-fg/80">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            {fmtDateTime(nextGame.scheduledStartTsUtc, nextGame.tz)}
            {nextGame.venueName ? (
              <>
                <MapPin className="ml-2 h-3.5 w-3.5" strokeWidth={1.75} />
                {nextGame.venueName}
                {nextGame.surfaceLabel ? ` · ${nextGame.surfaceLabel}` : ""}
              </>
            ) : null}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[28px] font-semibold tabular-nums leading-none">
            {countdown(nextGame.scheduledStartTsUtc, now)}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/schedule"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-white/20"
        >
          Game details
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
        {nextGame.venueName ? (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(nextGame.venueName)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-white/20"
          >
            Directions
            <ExternalLink className="h-3 w-3" strokeWidth={2} />
          </a>
        ) : null}
      </div>
    </section>
  );
}

/* --------------------------- recent games -------------------------- */

function RecentGamesCard({
  recent,
  myTeamId,
  opponentNames
}: {
  recent: Game[];
  myTeamId: string | null;
  opponentNames: Map<string, string>;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <Eyebrow>Recent games</Eyebrow>
        <Link
          href="/schedule"
          className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
        >
          All games →
        </Link>
      </header>
      {recent.length === 0 ? (
        <div className="px-5 py-6 text-[13px] text-fg-muted">
          No completed games yet. Results land here after the season's first
          puck drop.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((g: Game) => {
            const isHome = g.homeTeamId === myTeamId;
            const us = isHome ? g.homeScore : g.awayScore;
            const them = isHome ? g.awayScore : g.homeScore;
            const result =
              us == null || them == null
                ? "—"
                : us > them
                  ? "W"
                  : us < them
                    ? "L"
                    : "T";
            const tone =
              result === "W" ? "success" : result === "L" ? "danger" : "neutral";
            const opponentId = isHome ? g.awayTeamId : g.homeTeamId;
            return (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium " +
                      (tone === "success"
                        ? "bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]"
                        : tone === "danger"
                          ? "bg-[var(--tint-rose-bg)] text-[var(--tint-rose-fg)]"
                          : "bg-surface-2 text-fg-muted")
                    }
                  >
                    {result}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-fg">
                      vs.{" "}
                      {opponentNames.get(opponentId) ?? "Unnamed team"}
                    </p>
                    <p className="text-[11px] text-fg-muted">
                      {formatInZone(g.scheduledStartTsUtc, g.tz, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
                <p className="font-mono text-[13px] font-medium tabular-nums text-fg">
                  {us ?? 0}–{them ?? 0}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ----------------------- registrations preview --------------------- */

type EnrichedRegistration = Registration & {
  orgName?: string | null;
  formName?: string | null;
  seasonName?: string | null;
  leagueName?: string | null;
  divisionName?: string | null;
  teamName?: string | null;
};


/* --------------------------- payments card ------------------------- */


/* ------------------------ notifications card ----------------------- */


/* ------------------------------ KPI ------------------------------- */


/* ----------------- open public registrations panel ----------------- */

interface OpenRegistration {
  seasonId: string;
  seasonName: string;
  sportCode: string;
  leagueId: string;
  leagueName: string;
  orgId: string;
  orgName: string;
  formId: string;
  formName: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
}

async function fetchOpenRegistrations(): Promise<OpenRegistration[]> {
  try {
    const data = await publicRegistration.listOpenForMe();
    return data.items ?? [];
  } catch {
    return [];
  }
}

