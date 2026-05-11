import Link from "next/link";
import { CalendarRange, MapPin, Pencil, Trophy } from "lucide-react";
import { Eyebrow } from "@sportspulse/ui";
import { Countdown } from "./countdown";
import type { DashboardState, DashboardTeam } from "./shared-types";

/**
 * Workflow 7C §6.3 — Off-season mode.
 *
 * Hero with countdown to the next registration opens-at, last-season
 * metrics, and an editable team profile card. The full-width green
 * banner + pulsing sidebar item are NOT rendered in this mode.
 */
export function OffSeasonView({
  team,
  state
}: {
  team: DashboardTeam;
  state: DashboardState;
}) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0C447C] to-[#185FA5] px-8 py-10 text-white">
        <Eyebrow className="text-white/70">// off-season</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {team.name}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {state.seasonName ?? "Most recent season"} — completed
        </p>
        <div className="mt-5">
          <Countdown targetIso={null} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="Final standing" value="—" />
        <MetricCard label="Record" value="—" />
        <MetricCard label="Goals" value="—" />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <Eyebrow>// last season</Eyebrow>
          <p className="mt-1 text-[15px] font-medium text-fg">Top scorer</p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Per-player stats render here once the stats module exposes a
            team aggregate endpoint.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <Eyebrow>// last season</Eyebrow>
          <p className="mt-1 text-[15px] font-medium text-fg">Most games</p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Top of the games-played leaderboard from your last completed
            season.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <Eyebrow>// team profile</Eyebrow>
          <Link
            href="/captain/team"
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          >
            <Pencil className="h-3 w-3" /> Edit team details
          </Link>
        </header>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          <ProfileField icon={Trophy} label="Team name" value={team.name} />
          <ProfileField
            icon={MapPin}
            label="Home rink"
            value={team.homeRink ?? "—"}
          />
          <ProfileField
            icon={CalendarRange}
            label="Status"
            value={team.status}
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className="mt-1 text-[28px] font-semibold tabular-nums text-fg">
        {value}
      </p>
    </div>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </p>
        <p className="truncate text-[14px] font-medium text-fg">{value}</p>
      </div>
    </div>
  );
}
