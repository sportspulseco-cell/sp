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
  Sparkles,
  Activity
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
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { PhaseProgress } from "@/components/ui/phase-progress";
import { PageHero } from "@/components/layout/page-hero";
import { Reveal } from "@/components/motion/reveal";
import { Counter } from "@/components/motion/counter";

export const metadata = { title: "Dashboard — SportsPulse Super Admin" };

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

  const kpis: Array<{
    label: string;
    value: number;
    unit: string;
    icon: typeof Building2;
    tint: Tint;
    href: string;
    hint: string;
  }> = [
    {
      label: "Organizations",
      value: orgsPage.items.length,
      unit: "",
      icon: Building2,
      tint: "violet",
      href: "/organizations",
      hint: "Active tenants"
    },
    {
      label: "Users",
      value: usersPage.items.length,
      unit: "",
      icon: Users,
      tint: "emerald",
      href: "/users",
      hint: "Across all orgs"
    },
    {
      label: "Active leagues",
      value: activeLeagues,
      unit: `/${leaguesPage.items.length}`,
      icon: Trophy,
      tint: "amber",
      href: "/leagues",
      hint: "In-season or registering"
    },
    {
      label: "Active memberships",
      value: membershipsPage.items.length,
      unit: "",
      icon: ListChecks,
      tint: "blue",
      href: "/rosters",
      hint: "Across all teams"
    }
  ];

  const seasonStages = [
    { index: 1, label: "Draft", code: "draft" },
    { index: 2, label: "Registration open", code: "registration_open" },
    { index: 3, label: "In progress", code: "in_progress" },
    { index: 4, label: "Playoffs", code: "playoffs" },
    { index: 5, label: "Completed", code: "completed" },
    { index: 6, label: "Archived", code: "archived" }
  ];
  const totalSeasons = seasonsPage.items.length || 1;
  const seasonRows = seasonStages.map((s) => {
    const done = seasonsPage.items.filter((x) => x.status === s.code).length;
    const isCurrent =
      done > 0 &&
      seasonsPage.items.every(
        (x) =>
          seasonStages.findIndex((st) => st.code === x.status) <= s.index
      );
    return {
      index: s.index,
      label: s.label,
      done,
      total: totalSeasons,
      state: isCurrent ? ("current" as const) : undefined
    };
  });

  return (
    <div className="space-y-12">
      {/* Hero — editorial page-of-record header */}
      <PageHero
        eyebrow={
          <>
            <span className="text-fg/70">// Platform</span>{" "}
            <span className="text-fg">· v2.0</span>
          </>
        }
        title="The pulse of every league."
        subtitle="A live read on every tenant on the platform — registrations, rosters, leagues, and the queues waiting for your attention."
        actions={
          <>
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
              className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-subtle px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-fg transition-colors hover:border-border-strong"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              Start a season
            </Link>
          </>
        }
      >
        {/* Live ticker rail — bottom of hero, like a stock-ticker */}
        <HeroTicker
          items={[
            {
              label: "Live games",
              value: liveGames,
              tone: liveGames > 0 ? "live" : "idle"
            },
            { label: "Scheduled today", value: scheduledGames, tone: "idle" },
            { label: "Submitted regs", value: submittedRegs, tone: "warn" },
            { label: "Active orgs", value: orgsPage.items.length, tone: "idle" }
          ]}
        />
      </PageHero>

      {/* KPI cards — stagger reveal with hover lift + corner sheen */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, unit, icon: Icon, tint, href, hint }, i) => (
          <Reveal key={label} delay={i * 0.06}>
            <Link
              href={href}
              className="group relative block overflow-hidden rounded-xl border border-border bg-surface-1 p-5 transition-all duration-fast ease-ease hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
            >
              {/* Diagonal sheen on hover */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 sheen opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <div className="relative flex items-center justify-between">
                <Eyebrow>{label}</Eyebrow>
                <IconTile icon={Icon} tint={tint} size="sm" />
              </div>
              <div className="relative mt-5 flex items-end justify-between">
                <div className="flex items-baseline gap-1 font-mono">
                  <Counter
                    value={value}
                    className="text-4xl font-medium tabular-nums tracking-tight text-fg"
                  />
                  {unit ? (
                    <span className="text-sm font-medium text-fg-muted">
                      {unit}
                    </span>
                  ) : null}
                </div>
                <ArrowUpRight
                  className="mb-1 h-3.5 w-3.5 text-fg-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                  strokeWidth={1.75}
                />
              </div>
              <p className="relative mt-2 text-[12px] text-fg-muted">{hint}</p>
            </Link>
          </Reveal>
        ))}
      </section>

      {/* Recent activity row + Season lifecycle */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-surface-1">
            <div className="border-b border-border px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <Eyebrow>Lifecycle</Eyebrow>
                  <h2 className="mt-1.5 text-base font-semibold tracking-tight text-fg">
                    Season distribution
                  </h2>
                  <p className="mt-0.5 text-[13px] text-fg-muted">
                    Where every season is in its journey
                  </p>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                  {seasonsPage.items.length} total
                </span>
              </div>
            </div>
            <div className="px-6 py-5">
              {seasonsPage.items.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-muted">
                  No seasons yet.
                </p>
              ) : (
                <PhaseProgress rows={seasonRows} />
              )}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div>
                <Eyebrow>Tenancy</Eyebrow>
                <h2 className="mt-1.5 text-base font-semibold tracking-tight text-fg">
                  Recent organizations
                </h2>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Newest tenants on the platform
                </p>
              </div>
              <Link
                href="/organizations"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition-colors duration-fast ease-ease hover:text-fg"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {orgsPage.items.length === 0 ? (
                <li className="px-6 py-10 text-center text-sm text-fg-muted">
                  No organizations yet.
                </li>
              ) : (
                orgsPage.items.slice(0, 8).map((o, i) => (
                  <Reveal as="li" key={o.id} delay={0.12 + i * 0.04}>
                    <Link
                      href={`/organizations/${o.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-3.5 text-sm transition-colors hover:bg-bg-subtle"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">
                          {o.displayName}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-fg-muted">
                          <span className="font-mono uppercase tracking-wide">
                            {o.orgType.replace(/_/g, " ")}
                          </span>{" "}
                          · {o.countryCode}
                        </p>
                      </div>
                      <Badge tone={statusTone(o.status)} mono>
                        {o.status}
                      </Badge>
                    </Link>
                  </Reveal>
                ))
              )}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* Pending queues — 6-up grid with stagger */}
      <section>
        <Reveal className="mb-4 flex items-end justify-between">
          <div>
            <Eyebrow>Queues</Eyebrow>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-fg">
              Pending attention
            </h2>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            {
              icon: ClipboardList,
              tint: "violet" as Tint,
              label: "Registrations to review",
              value: submittedRegs,
              href: "/registrations"
            },
            {
              icon: Trophy,
              tint: "amber" as Tint,
              label: "Seasons in registration",
              value: seasonsPage.items.filter(
                (s) => s.status === "registration_open"
              ).length,
              href: "/seasons"
            },
            {
              icon: Building2,
              tint: "rose" as Tint,
              label: "Suspended orgs",
              value: suspendedOrgs,
              href: "/organizations"
            },
            {
              icon: ListChecks,
              tint: "cyan" as Tint,
              label: "Teams",
              value: teamsPage.items.length,
              href: "/teams"
            },
            {
              icon: CircleDot,
              tint: "emerald" as Tint,
              label: "Games live now",
              value: liveGames,
              href: "/games?status=in_play",
              live: liveGames > 0
            },
            {
              icon: CalendarRange,
              tint: "blue" as Tint,
              label: "Games scheduled",
              value: scheduledGames,
              href: "/games?status=scheduled"
            }
          ].map((q, i) => (
            <Reveal key={q.label} delay={i * 0.05}>
              <Link
                href={q.href}
                className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border bg-surface-1 p-4 transition-all duration-fast ease-ease hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 sheen opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
                <div className="relative flex min-w-0 items-center gap-3">
                  <IconTile icon={q.icon} tint={q.tint} size="sm" />
                  <span className="truncate text-[13px] font-medium text-fg">
                    {q.label}
                  </span>
                </div>
                <span className="relative flex items-center gap-2">
                  {q.live ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  ) : null}
                  <span className="font-mono text-base font-medium tabular-nums text-fg">
                    <Counter value={q.value} duration={0.9} />
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Footer band — editorial sign-off */}
      <Reveal className="border-t border-border pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[12px] text-fg-muted">
            <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="font-mono uppercase tracking-[0.18em]">
              All systems · operational
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

/**
 * Hero ticker — small kinetic rail of live numbers anchored to the
 * bottom of the hero. Each tile gets its own Counter.
 */
function HeroTicker({
  items
}: {
  items: { label: string; value: number; tone: "live" | "warn" | "idle" }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex flex-col gap-2 bg-surface-1 px-5 py-4"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
            {it.label}
          </span>
          <span className="flex items-baseline gap-2">
            <Counter
              value={it.value}
              className="font-mono text-2xl font-medium tabular-nums tracking-tight text-fg"
            />
            {it.tone === "live" && it.value > 0 ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
