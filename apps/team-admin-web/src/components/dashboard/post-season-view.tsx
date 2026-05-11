import Link from "next/link";
import { AlertTriangle, Trophy } from "lucide-react";
import { Badge, Eyebrow } from "@sportspulse/ui";
import type { DashboardState, DashboardTeam } from "./shared-types";

/**
 * Workflow 7C §6.10 — Post-season mode.
 *
 * Bracket hero (placeholder until the bracket sprint), playoff
 * roster split into eligible + ineligible sections, and the
 * "contact your league admin" callout for the ineligible group.
 *
 * NOTE per spec §6.10 — Add player / Drop player controls do not
 * render in this mode. The Roster sidebar entry resolves to a
 * read-only Playoff roster page (built in this commit at
 * /captain/playoff-roster).
 */
export function PostSeasonView({
  team,
  state
}: {
  team: DashboardTeam;
  state: DashboardState;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-[#0C447C] to-[#185FA5] px-8 py-10 text-white">
        <Eyebrow className="text-white/70">// post-season</Eyebrow>
        <div className="mt-1 flex items-center gap-3">
          <Trophy className="h-7 w-7 text-amber-200" strokeWidth={1.75} />
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {team.name} — playoffs
          </h1>
        </div>
        <p className="mt-2 text-sm text-white/80">
          {state.seasonName} · Bracket view goes live with the playoff sprint.
        </p>
        <Link
          href="/captain/playoff-roster"
          className="mt-4 inline-flex w-fit items-center gap-2 rounded-md bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25"
        >
          View playoff roster
        </Link>
      </section>

      <section className="rounded-xl border border-amber-400/40 bg-amber-50 p-4 text-[13px] text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <p className="font-medium">Roster changes are locked</p>
        </div>
        <p className="mt-1">
          Add / drop controls are not available in post-season. Contact your
          league admin if you believe a player is incorrectly marked
          ineligible.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <Eyebrow>// playoff eligibility</Eyebrow>
        <p className="mt-1 text-[13px] text-fg-muted">
          The eligible / ineligible split renders here once the admin runs
          the playoff sweep for this season.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="success" mono>
            eligible · —
          </Badge>
          <Badge tone="danger" mono>
            ineligible · —
          </Badge>
        </div>
      </section>
    </div>
  );
}
