import { Building2, CalendarRange, CircleDot, Trophy } from "lucide-react";
import Link from "next/link";
import { gameOps, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile, type Tint } from "@/components/ui/icon-tile";

export const metadata = { title: "Overview — League Admin" };

export default async function DashboardPage() {
  const [leagues, teams, games] = await Promise.all([
    leagueMgmt.listLeagues({}).catch(() => ({ items: [] })),
    leagueMgmt.listTeams({}).catch(() => ({ items: [] })),
    gameOps.listGames({ limit: 100 }).catch(() => ({ items: [] }))
  ]);

  const liveGames = games.items.filter((g) => g.status === "in_play").length;
  const scheduled = games.items.filter((g) => g.status === "scheduled").length;

  const kpis: Array<{
    label: string;
    value: number;
    href: string;
    icon: typeof Building2;
    tint: Tint;
    hint: string;
  }> = [
    {
      label: "My leagues",
      value: leagues.items.length,
      href: "/leagues",
      icon: Trophy,
      tint: "amber",
      hint: "Leagues you can manage"
    },
    {
      label: "Teams",
      value: teams.items.length,
      href: "/teams",
      icon: Building2,
      tint: "violet",
      hint: "Across your leagues"
    },
    {
      label: "Games scheduled",
      value: scheduled,
      href: "/games?status=scheduled",
      icon: CalendarRange,
      tint: "blue",
      hint: "Upcoming fixtures"
    },
    {
      label: "Live now",
      value: liveGames,
      href: "/games?status=in_play",
      icon: CircleDot,
      tint: "emerald",
      hint: "Games in_play"
    }
  ];

  return (
    <div className="space-y-12">
      <header>
        <Eyebrow dot>League · Overview</Eyebrow>
        <h1 className="mt-3 text-[44px] font-semibold leading-[1.05] tracking-tighter text-fg">
          Welcome back, league admin.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Run your league at a glance — leagues, divisions, teams, schedules,
          and standings, all in one place.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="group block rounded-xl border border-border bg-surface-1 p-5 transition-colors duration-fast ease-ease hover:border-border-strong"
          >
            <div className="flex items-center justify-between">
              <Eyebrow>{k.label}</Eyebrow>
              <IconTile icon={k.icon} tint={k.tint} size="sm" />
            </div>
            <p className="mt-5 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
              {k.value}
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">{k.hint}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
