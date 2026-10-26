import { formatMoney, registrationClosesLabel } from "@sportspulse/kernel";
import Link from "next/link";
import { formatInZone } from "@sportspulse/kernel";
import {
  AlertCircle,
  ArrowRight,
  CalendarRange,
  Check,
  ClipboardList,
  Clock,
  Compass,
  ExternalLink,
  MapPin,
  Trophy,
  Wallet,
  type LucideIcon
} from "lucide-react";
import { Badge, Eyebrow, EmptyState, IconTile } from "@sportspulse/ui";
import type {
  Game,
  Notification,
  Registration
} from "@sportspulse/api-client";
import { captain, communications, finance, gameOps, iam, leagueMgmt, loadMeScope, publicRegistration, registration, roster, subs } from "@/lib/api/server-api";
import { TeamOffersCard } from "@/components/team-offers-card";
import { SubRequestsCard } from "@/components/sub-requests-card";

type MyInvoice = Awaited<ReturnType<typeof finance.myInvoices>>["items"][number];
import { RegistrationStateBanner } from "./registration-state-banner";
import { CaptainConsoleBanner } from "@/components/captain-console-banner";
import { iconFor, noticeAt, tintFor, titleOf } from "./notifications/notice-format";

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function relativeTime(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "Just now";
  if (abs < hour) return `${Math.floor(abs / minute)} min ago`;
  if (abs < day) return `${Math.floor(abs / hour)} h ago`;
  if (abs < 7 * day) return `${Math.floor(abs / day)} d ago`;
  return fmtDate(iso);
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
  return `Today — ${hours}h ${mins}m away`;
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

  const fullName = [profile.legalFirstName, profile.legalLastName]
    .filter(Boolean)
    .join(" ");
  const displayName = profile.preferredName || fullName || profile.email || "Player";
  const firstName = (profile.legalFirstName ?? displayName).split(" ")[0] ?? "Player";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1">
          <Eyebrow>Home</Eyebrow>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tighter text-fg">
            Hey {firstName}.
          </h1>
          <p className="text-[13px] text-fg-muted">
            Your team, your registrations, and what's next on the schedule.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/schedule"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
            My schedule
          </Link>
        </div>
      </header>

      {/* Workflow 5 §3 — registration state banner above the hero so the
          player knows whether they're new / returning / mid-funnel. */}
      <RegistrationStateBanner registrations={regPage.items} onTeam={!!team} />

      {/* A team offered this player a spot (free-agent pool) or invited
          them: the one decision waiting on them, so it sits up top. */}
      <TeamOffersCard items={myInvites.items} />
      <SubRequestsCard items={mySubRequests.items} />

      {/* Dual-role users (player + captain) get a single discoverable
          entry point into the captain console — which lives in
          team-admin-web. The full /captain/* page tree was removed
          from player-web (plan P1-2 / audit §1 §2 §6) to kill the
          byte-identical duplication. */}
      {scope.roleCodes.includes("captain") && <CaptainConsoleBanner />}

      {/* Open public registrations — leagues currently accepting
          signups. Added to close the discovery gap: a /forms-published
          registration link used to be invisible to a signed-in player. */}
      <OpenRegistrationsPanel items={openRegs} />

      {/* Next-game hero — full width, brand blue. Highest-priority element
          on the dashboard per Workflow 5 §3.2. */}
      <NextGameHero
        nextGame={nextGame}
        teamId={myTeamId}
        teamName={team?.name ?? "Your team"}
        opponentNames={opponentNames}
      />

      {/* 4 KPI cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Trophy}
          label="Games played"
          value={String(recent.length)}
          hint={
            recent.length === 0
              ? "Season hasn't started"
              : `Across ${teammates} teammates`
          }
          tint="violet"
        />
        <Kpi
          icon={Trophy}
          label="Team record"
          value={`${record.w}-${record.l}-${record.t}`}
          hint={team ? team.name : "—"}
          tint={record.w > record.l ? "emerald" : "amber"}
        />
        <Kpi
          icon={CalendarRange}
          label="Upcoming games"
          value={String(upcoming.length)}
          hint={
            nextGame
              ? `Next: ${fmtDateTime(nextGame.scheduledStartTsUtc, nextGame.tz)}`
              : "Nothing scheduled"
          }
          tint="blue"
        />
        <Kpi
          icon={Wallet}
          label="Balance due"
          value={formatMoney(balanceCents, currency)}
          hint={
            balanceCents === 0
              ? "Paid in full"
              : nextInvoice?.dueAt
                ? `Due ${fmtDate(nextInvoice.dueAt)}`
                : "No due date set"
          }
          tint={overdue ? "rose" : balanceCents > 0 ? "amber" : "emerald"}
        />
      </section>

      {/* Row 1 — Recent games + Registrations card */}
      <section className="grid gap-4 lg:grid-cols-2">
        <RecentGamesCard
          recent={recent}
          myTeamId={myTeamId}
          opponentNames={opponentNames}
        />
        <RegistrationsPreview regs={regPage.items} />
      </section>

      {/* Row 2 — Payments summary + Notifications preview */}
      <section className="grid gap-4 lg:grid-cols-2">
        <PaymentsSummary
          openInvoices={openInvoices}
          balanceCents={balanceCents}
          currency={currency}
          totalReceived={invoicesPage.items.reduce(
            (a, i) => a + i.paidCents,
            0
          )}
        />
        <NotificationsPreview notifs={recentNotifs} now={now} />
      </section>
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
        <Eyebrow className="!text-accent-fg/70">Next game</Eyebrow>
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
          <Eyebrow className="!text-accent-fg/70">Next game</Eyebrow>
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

function RegistrationsPreview({ regs }: { regs: EnrichedRegistration[] }) {
  const active = regs.filter(
    (r) => r.status !== "rejected" && r.status !== "withdrawn"
  );
  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <Eyebrow>My registrations</Eyebrow>
        <Link
          href="/register"
          className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
        >
          Find a team →
        </Link>
      </header>
      {active.length === 0 ? (
        <div className="space-y-3 px-5 py-6">
          <p className="text-[13px] text-fg-muted">
            You are not registered for a season yet. Pick an open season below,
            or use the link your captain sent you.
          </p>
          <Link
            href="/register"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-bg"
          >
            <Compass className="h-3.5 w-3.5" strokeWidth={2} />
            Find a season to join
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {active.slice(0, 4).map((r) => {
            const status = r.status as string;
            const tone: "success" | "warning" | "danger" | "info" | "neutral" =
              status === "approved"
                ? "success"
                : status === "rejected" ||
                    status === "withdrawn" ||
                    status === "cancelled"
                  ? "danger"
                  : status.startsWith("pending") || status === "submitted"
                    ? "warning"
                    : "info";
            const title =
              r.seasonName ||
              r.formName ||
              r.leagueName ||
              r.orgName ||
              "Registration";
            const sub = [r.divisionName, r.teamName, r.orgName]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {title}
                  </p>
                  <p className="truncate text-[11px] text-fg-muted">
                    {sub ||
                      (r.submittedAt
                        ? `Submitted ${fmtDate(r.submittedAt)}`
                        : "Draft")}
                  </p>
                </div>
                <Badge mono tone={tone}>
                  {status.replace(/_/g, " ")}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* --------------------------- payments card ------------------------- */

function PaymentsSummary({
  openInvoices,
  balanceCents,
  currency,
  totalReceived
}: {
  openInvoices: MyInvoice[];
  balanceCents: number;
  currency: string;
  totalReceived: number;
}) {
  const next = openInvoices[0];
  const isOverdue = next?.status === "overdue";
  const dueSoon =
    !isOverdue &&
    next?.dueAt &&
    new Date(next.dueAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <Eyebrow>Payments</Eyebrow>
        <Link
          href="/payments"
          className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
        >
          Manage →
        </Link>
      </header>
      {balanceCents === 0 ? (
        <div className="px-5 py-6">
          <p className="text-[13px] text-fg">
            <Check
              className="mr-1.5 inline h-4 w-4 text-[var(--tint-emerald-fg)]"
              strokeWidth={2.25}
            />
            Paid in full
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            {formatMoney(totalReceived, currency)} received this season.
          </p>
        </div>
      ) : (
        <div className="space-y-4 px-5 py-4">
          {(isOverdue || dueSoon) && next ? (
            <div
              className={
                "rounded-md px-3 py-2 text-[12px] " +
                (isOverdue
                  ? "bg-[var(--tint-rose-bg)] text-[var(--tint-rose-fg)]"
                  : "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)]")
              }
            >
              <p className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
                {formatMoney(next.totalCents - next.paidCents, next.currency)}{" "}
                {isOverdue ? "overdue" : "due soon"}
                {next.dueAt ? ` · ${fmtDate(next.dueAt)}` : ""}
              </p>
            </div>
          ) : null}
          <ul className="space-y-2">
            {openInvoices.slice(0, 3).map((inv: MyInvoice) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={
                      "h-2 w-2 shrink-0 rounded-full " +
                      (inv.status === "overdue"
                        ? "bg-[var(--error)]"
                        : inv.status === "partial"
                          ? "bg-[var(--warning)]"
                          : "bg-[var(--tint-blue-fg)]")
                    }
                  />
                  <span className="truncate text-[12px] text-fg">{inv.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                    {inv.invoiceNumber}
                  </span>
                  {inv.dueAt ? (
                    <span className="text-[11px] text-fg-muted">
                      · {fmtDate(inv.dueAt)}
                    </span>
                  ) : null}
                </div>
                <span className="font-mono text-[12px] tabular-nums text-fg">
                  {formatMoney(inv.totalCents - inv.paidCents, inv.currency)}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border pt-3 text-[11px] text-fg-muted">
            Paid so far:{" "}
            <span className="text-[var(--tint-emerald-fg)]">
              {formatMoney(totalReceived, currency)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------ notifications card ----------------------- */

function NotificationsPreview({
  notifs,
  now
}: {
  notifs: Notification[];
  now: Date;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <Eyebrow>Notifications</Eyebrow>
        <Link
          href="/notifications"
          className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
        >
          All →
        </Link>
      </header>
      {notifs.length === 0 ? (
        <div className="px-5 py-6 text-[13px] text-fg-muted">
          You're all caught up. New schedule, payment, and admin notes will
          show up here.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {notifs.slice(0, 3).map((n: Notification) => (
            <li key={n.id} className="flex items-start gap-3 px-5 py-3">
              <IconTile
                icon={iconFor(n.templateCode)}
                tint={tintFor(n.templateCode)}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12px] font-medium text-fg">
                  {titleOf(n)}
                </p>
                <p className="line-clamp-2 text-[11px] text-fg-muted">
                  {n.body}
                </p>
              </div>
              <p className="shrink-0 font-mono text-[10px] text-fg-muted">
                {relativeTime(noticeAt(n), now)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ KPI ------------------------------- */

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
      <p className="mt-5 font-mono text-[24px] font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-1 truncate text-[12px] text-fg-muted">{hint}</p>
    </div>
  );
}

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


function OpenRegistrationsPanel({ items }: { items: OpenRegistration[] }) {
  if (items.length === 0) return null;
  const headline =
    items.length === 1
      ? "A league is accepting registrations"
      : `${items.length} leagues are accepting registrations`;
  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--tint-emerald-fg)]/30 bg-[var(--success)]/[0.06] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--tint-emerald-fg)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tint-emerald-bg)]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--success)]" />
            </span>
            <span>open · for signup</span>
          </p>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-tight text-fg">
            {headline}
          </h2>
        </div>
        <Link
          href="/register"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--success)] px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white hover:bg-[var(--success)]"
        >
          See all
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 3).map((r) => (
          <li key={r.seasonId}>
            <Link
              href={`/register/${r.seasonId}`}
              className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-bg p-4 hover:border-[var(--tint-emerald-fg)]/30"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                {r.orgName}
                <span className="text-fg-subtle"> · </span>
                {r.leagueName}
              </p>
              <p className="truncate text-[14px] font-semibold tracking-tight text-fg">
                {r.seasonName}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                  <CalendarRange className="h-3 w-3" strokeWidth={1.75} />
                  {registrationClosesLabel(r.registrationClosesAt) ?? "open"}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--tint-emerald-fg)]">
                  Sign up{" "}
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
