import {
  Building2,
  Trophy,
  Users,
  ListChecks,
  ClipboardList,
  ArrowUpRight,
  ArrowRight,
  CircleDot,
  CalendarRange,
  Activity,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import {
  gameOps,
  iam,
  leagueMgmt,
  orgs,
  registration,
  roster
} from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { Reveal } from "@/components/motion/reveal";
import { Counter } from "@/components/motion/counter";
import {
  EkgLine,
  LiveDot,
  MarqueeRail,
  ScanSheen
} from "@/components/motion/kinetic";
import { GameClock, ProgressBar, BarChart } from "./live-widgets";

export const metadata = { title: "Dashboard — SportsPulse Super Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const [
    orgsPage,
    usersPage,
    seasonsPage,
    leaguesPage,
    teamsPage,
    regsPage,
    membershipsPage,
    gamesPage
  ] = await Promise.all([
    orgs.list({ limit: 100 }).catch(() => ({ items: [] })),
    iam.listUsers({ limit: 100 }).catch(() => ({ items: [] })),
    leagueMgmt.listSeasons().catch(() => ({ items: [] })),
    leagueMgmt.listLeagues().catch(() => ({ items: [] })),
    leagueMgmt.listTeams().catch(() => ({ items: [] })),
    registration.listRegistrations().catch(() => ({ items: [] })),
    roster.listMemberships({ activeOnly: true }).catch(() => ({ items: [] })),
    gameOps.listGames({ limit: 100 }).catch(() => ({ items: [] }))
  ]);

  const liveGames = gamesPage.items.filter((g) => g.status === "in_play").length;
  const scheduledGames = gamesPage.items.filter(
    (g) => g.status === "scheduled"
  ).length;
  const activeLeagues = leaguesPage.items.filter(
    (l) => l.status === "active" || l.status === "draft"
  ).length;
  const submittedRegs = regsPage.items.filter(
    (r) => r.status === "submitted" || r.status === "under_review"
  ).length;
  const suspendedOrgs = orgsPage.items.filter(
    (o) => o.status === "suspended"
  ).length;
  const registrationOpen = seasonsPage.items.filter(
    (s) => s.status === "registration_open"
  ).length;

  // Marquee feed — real platform numbers with live ping dots interleaved.
  const marqueeItems = [
    { key: "leagues", node: <>{activeLeagues} leagues active</> },
    { key: "live", node: <>{liveGames} games in play</> },
    { key: "regs", node: <>{submittedRegs} registrations awaiting review</> },
    { key: "members", node: <>{membershipsPage.items.length} active memberships</> },
    { key: "orgs", node: <>{orgsPage.items.length} organizations</> },
    { key: "users", node: <>{usersPage.items.length} users</> },
    { key: "seasons", node: <>{seasonsPage.items.length} seasons tracked</> },
    { key: "ops", node: <>all systems operational</> }
  ];

  return (
    <div className="space-y-12">
      {/* HERO — the landing-style page-of-record, with the live dashboard
          strip embedded INSIDE the hero (per the landing's pattern). */}
      <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface-1">
        {/* Layered backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-grid-light mask-fade-edges opacity-90"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-radial-fade-light"
        />
        {/* Breathing accent halo behind the headline */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 animate-pulse-slow rounded-full bg-[--accent]/10 blur-[140px]"
        />

        <div className="relative px-7 pb-10 pt-12 lg:px-10 lg:pb-14 lg:pt-16">
          {/* Mono eyebrow with live dot */}
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted">
            <LiveDot tone="accent" />
            <span className="text-fg/80">// platform</span>
            <span className="text-fg-subtle">·</span>
            <span>v2.0</span>
          </div>

          <h1 className="mt-5 max-w-[18ch] text-balance font-sans text-[clamp(40px,7vw,96px)] font-semibold leading-[0.92] tracking-tighter text-fg">
            The pulse of every league.
          </h1>

          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
            A live read on every tenant on the platform — registrations,
            rosters, leagues, and the queues waiting for your attention.
          </p>

          {/* Pill CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Link
              href="/registrations"
              className="group inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.02] active:scale-100"
            >
              Review queue
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.25}
              />
            </Link>
            <Link
              href="/org-setup"
              className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-bg-subtle px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              Start a season
            </Link>
          </div>

          {/* DASHBOARD STRIP — three specialized live cards + one
              full-width stat band, per landing hero pattern. */}
          <Reveal delay={0.18} y={32} className="mt-14 lg:mt-20">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <LiveGameCard liveCount={liveGames} scheduled={scheduledGames} />
              <ReviewQueueCard
                submitted={submittedRegs}
                opens={registrationOpen}
                totalSeasons={seasonsPage.items.length}
              />
              <PlatformLoadCard
                orgs={orgsPage.items.length}
                users={usersPage.items.length}
                memberships={membershipsPage.items.length}
                teams={teamsPage.items.length}
              />

              {/* Footer stat band — 4 cells, hairline borders */}
              <div className="md:col-span-3">
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
                  <StatCell
                    label="Leagues active"
                    value={activeLeagues}
                    pulse={activeLeagues > 0}
                  />
                  <StatCell label="Players" value={usersPage.items.length} />
                  <StatCell
                    label="Suspended orgs"
                    value={suspendedOrgs}
                    tone={suspendedOrgs > 0 ? "warn" : "ok"}
                  />
                  <StatCell
                    label="Live games"
                    value={liveGames}
                    tone={liveGames > 0 ? "live" : "ok"}
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MARQUEE RAIL — endless scrolling feed of platform numbers.
          Continuous motion, never sits still. */}
      <MarqueeRail items={marqueeItems} className="-mx-2 rounded-xl" />

      {/* RECENT ORGS · two-column with editorial header */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Reveal>
          <div className="rounded-xl border border-border bg-surface-1 p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
              // queues
            </p>
            <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-fg">
              Pending attention
            </h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              Only what's blocked, only what needs you.
            </p>
            <div className="mt-6 space-y-3">
              <QueueRow
                href="/registrations"
                icon={ClipboardList}
                tint="violet"
                label="Registrations to review"
                value={submittedRegs}
              />
              <QueueRow
                href="/seasons"
                icon={Trophy}
                tint="amber"
                label="Seasons in registration"
                value={registrationOpen}
              />
              <QueueRow
                href="/organizations"
                icon={Building2}
                tint="rose"
                label="Suspended orgs"
                value={suspendedOrgs}
              />
              <QueueRow
                href="/games?status=in_play"
                icon={CircleDot}
                tint="emerald"
                label="Games live now"
                value={liveGames}
                live={liveGames > 0}
              />
              <QueueRow
                href="/games?status=scheduled"
                icon={CalendarRange}
                tint="blue"
                label="Games scheduled"
                value={scheduledGames}
              />
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                  // tenancy
                </p>
                <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-fg">
                  Recent organizations
                </h2>
                <p className="mt-1 text-[13px] text-fg-muted">
                  Newest tenants on the platform.
                </p>
              </div>
              <Link
                href="/organizations"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {orgsPage.items.length === 0 ? (
                <li className="px-6 py-12 text-center text-sm text-fg-muted">
                  No organizations yet.
                </li>
              ) : (
                orgsPage.items.slice(0, 8).map((o, i) => (
                  <Reveal as="li" key={o.id} delay={0.05 + i * 0.035}>
                    <Link
                      href={`/organizations/${o.id}`}
                      className="group flex items-center justify-between gap-4 px-6 py-4 text-sm transition-colors hover:bg-bg-subtle"
                    >
                      <div className="min-w-0 flex items-center gap-4">
                        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-fg">
                            {o.displayName}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                            {o.orgType.replace(/_/g, " ")} · {o.countryCode}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={statusTone(o.status)} mono>
                          {o.status}
                        </Badge>
                        <ArrowUpRight
                          className="h-3.5 w-3.5 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                          strokeWidth={1.75}
                        />
                      </div>
                    </Link>
                  </Reveal>
                ))
              )}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* Editorial footer band */}
      <Reveal className="border-t border-border pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[12px] text-fg-muted">
            <LiveDot tone="success" />
            <span className="font-mono uppercase tracking-[0.22em]">
              all systems · operational
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-subtle">
            sp · superadmin · v2
          </span>
        </div>
      </Reveal>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Live cards — three specialized cells in the hero strip. Each animates
 * differently to match its data shape. Pattern lifted from landing-web's
 * <DashboardStrip>.
 * -------------------------------------------------------------------------*/

function LiveGameCard({
  liveCount,
  scheduled
}: {
  liveCount: number;
  scheduled: number;
}) {
  const isLive = liveCount > 0;
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      {isLive ? <ScanSheen /> : null}
      <div className="flex items-center justify-between">
        <div
          className={
            isLive
              ? "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-rose-600"
              : "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted"
          }
        >
          {isLive ? <LiveDot tone="error" /> : <CircleDot className="h-3 w-3" strokeWidth={1.75} />}
          {isLive ? "live" : "no live games"}
        </div>
        <Activity className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      </div>
      <div className="mt-5 flex items-baseline gap-3 font-mono tabular-nums">
        <Counter
          value={liveCount}
          className="text-4xl font-semibold tracking-tighter text-fg"
        />
        <span className="text-fg-subtle">/</span>
        <Counter
          value={liveCount + scheduled}
          className="text-2xl font-medium tracking-tight text-fg-muted"
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[12px] text-fg-muted">
          {isLive
            ? `${liveCount} in play · ${scheduled} scheduled`
            : `${scheduled} scheduled next`}
        </p>
        {isLive ? <GameClock /> : <EkgLine width={88} height={24} />}
      </div>
    </article>
  );
}

function ReviewQueueCard({
  submitted,
  opens,
  totalSeasons
}: {
  submitted: number;
  opens: number;
  totalSeasons: number;
}) {
  const tone = submitted > 0 ? "warn" : "ok";
  const pct =
    totalSeasons === 0 ? 0 : Math.min(100, Math.round((opens / totalSeasons) * 100));
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
          Review queue
        </p>
        <span
          className={
            tone === "warn"
              ? "font-mono text-[10px] uppercase tracking-[0.18em] text-amber-700"
              : "font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700"
          }
        >
          {tone === "warn" ? `${submitted} pending` : "clear"}
        </span>
      </div>
      <div className="mt-5">
        <Counter
          value={submitted}
          className="font-mono text-4xl font-semibold tabular-nums tracking-tighter text-fg"
        />
      </div>
      <ProgressBar value={pct} />
      <p className="mt-2 text-[11px] text-fg-muted">
        {opens} of {totalSeasons || 0} seasons open for registration · {pct}%
      </p>
    </article>
  );
}

function PlatformLoadCard({
  orgs,
  users,
  memberships,
  teams
}: {
  orgs: number;
  users: number;
  memberships: number;
  teams: number;
}) {
  // Show the four numbers as a small bar chart (relative heights),
  // the way landing's SchedulerCard renders fixtures.
  const series = [
    { label: "Orgs", value: orgs },
    { label: "Teams", value: teams },
    { label: "Users", value: users },
    { label: "Active", value: memberships }
  ];
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
          Platform load
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-700">
          <LiveDot tone="cyan" />
          syncing
        </span>
      </div>
      <BarChart
        data={series.map((s) => ({
          label: s.label,
          value: s.value,
          height: Math.max(0.12, s.value / max)
        }))}
      />
      <div className="mt-3 flex items-center justify-between text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1 font-mono">
          <Users className="h-3 w-3" strokeWidth={1.75} />
          <Counter value={users} /> users
        </span>
        <span className="inline-flex items-center gap-1 font-mono">
          <ListChecks className="h-3 w-3" strokeWidth={1.75} />
          <Counter value={memberships} /> active
        </span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------
 * Footer stat strip cell + Queue row
 * -------------------------------------------------------------------------*/

function StatCell({
  label,
  value,
  pulse,
  tone = "ok"
}: {
  label: string;
  value: number;
  pulse?: boolean;
  tone?: "ok" | "warn" | "live";
}) {
  return (
    <div className="relative bg-surface-1 px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <Counter
          value={value}
          className="font-mono text-2xl font-semibold tabular-nums tracking-tighter text-fg"
        />
        {tone === "live" && value > 0 ? <LiveDot tone="error" /> : null}
        {tone === "warn" && value > 0 ? <LiveDot tone="accent" /> : null}
        {pulse && value > 0 && tone === "ok" ? <LiveDot tone="success" /> : null}
      </p>
    </div>
  );
}

function QueueRow({
  href,
  icon: Icon,
  tint,
  label,
  value,
  live
}: {
  href: string;
  icon: typeof Building2;
  tint: Tint;
  label: string;
  value: number;
  live?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-border bg-bg-subtle px-4 py-3 transition-all hover:-translate-y-px hover:border-border-strong hover:bg-surface-1"
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconTile icon={Icon} tint={tint} size="sm" />
        <span className="truncate text-[13px] font-medium text-fg">{label}</span>
      </div>
      <div className="flex items-center gap-2.5">
        {live ? <LiveDot tone="success" /> : null}
        <Counter
          value={value}
          className="font-mono text-base font-semibold tabular-nums text-fg"
        />
        <ArrowRight
          className="h-3.5 w-3.5 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
          strokeWidth={1.75}
        />
      </div>
    </Link>
  );
}
