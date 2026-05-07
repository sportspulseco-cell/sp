import {
  Building2,
  Trophy,
  Users,
  ListChecks,
  ClipboardList,
  ArrowUpRight,
  ArrowRight,
  CircleDot,
  CalendarRange
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
import { StatNumber } from "@/components/ui/stat-number";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { PhaseProgress } from "@/components/ui/phase-progress";

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

  // Status spread across all seasons, used by Phase progress card.
  // Counts of seasons currently in each lifecycle stage.
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
        (x) => seasonStages.findIndex((st) => st.code === x.status) <= s.index
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
      {/* Hero header — SuperAccountant pattern: eyebrow + huge h1 + sub */}
      <header>
        <Eyebrow dot>Platform · Overview</Eyebrow>
        <h1 className="mt-3 text-[44px] font-semibold leading-[1.05] tracking-tighter text-fg">
          Welcome back, super admin.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          A live read on every tenant on the platform — registrations,
          rosters, leagues, and the queues waiting for your attention.
        </p>
      </header>

      {/* KPI cards — colored icon tiles + mono stat numbers */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, unit, icon, tint, href, hint }) => (
          <Link
            key={label}
            href={href}
            className="group block rounded-xl border border-border bg-surface-1 p-5 transition-colors duration-fast ease-ease hover:border-border-strong"
          >
            <div className="flex items-center justify-between">
              <Eyebrow>{label}</Eyebrow>
              <IconTile icon={icon} tint={tint} size="sm" />
            </div>
            <div className="mt-5 flex items-end justify-between">
              <StatNumber value={value} unit={unit} size="md" />
              <ArrowUpRight
                className="mb-1 h-3.5 w-3.5 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100"
                strokeWidth={1.75}
              />
            </div>
            <p className="mt-2 text-[12px] text-fg-muted">{hint}</p>
          </Link>
        ))}
      </section>

      {/* Recent activity row + Season lifecycle */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Phase progress — season lifecycle distribution */}
        <div className="rounded-xl border border-border bg-surface-1 lg:col-span-1">
          <div className="border-b border-border px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-fg">
                  Season lifecycle
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

        {/* Recent organizations */}
        <div className="rounded-xl border border-border bg-surface-1 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-fg">
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
              orgsPage.items.slice(0, 8).map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 text-sm"
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
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {/* Pending queues — 4-up grid */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Eyebrow>Queues</Eyebrow>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-fg">
              Pending attention
            </h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Queue
            icon={ClipboardList}
            tint="violet"
            label="Registrations to review"
            value={submittedRegs}
            href="/registrations"
          />
          <Queue
            icon={Trophy}
            tint="amber"
            label="Seasons in registration"
            value={
              seasonsPage.items.filter(
                (s) => s.status === "registration_open"
              ).length
            }
            href="/seasons"
          />
          <Queue
            icon={Building2}
            tint="rose"
            label="Suspended orgs"
            value={suspendedOrgs}
            href="/organizations"
          />
          <Queue
            icon={ListChecks}
            tint="cyan"
            label="Teams"
            value={teamsPage.items.length}
            href="/teams"
          />
          <Queue
            icon={CircleDot}
            tint="emerald"
            label="Games live now"
            value={liveGames}
            href="/games?status=in_play"
          />
          <Queue
            icon={CalendarRange}
            tint="blue"
            label="Games scheduled"
            value={scheduledGames}
            href="/games?status=scheduled"
          />
        </div>
      </section>
    </div>
  );
}

function Queue({
  icon,
  tint,
  label,
  value,
  href
}: {
  icon: typeof Building2;
  tint: Tint;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 p-4 transition-colors duration-fast ease-ease hover:border-border-strong"
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconTile icon={icon} tint={tint} size="sm" />
        <span className="truncate text-[13px] font-medium text-fg">
          {label}
        </span>
      </div>
      <span className="font-mono text-base font-medium tabular-nums text-fg">
        {value}
      </span>
    </Link>
  );
}
