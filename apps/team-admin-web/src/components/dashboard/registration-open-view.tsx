import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Badge, Eyebrow } from "@sportspulse/ui";
import type { DashboardState, DashboardTeam } from "./shared-types";

/**
 * Workflow 7C §6.5 — Registration-open mode.
 *
 * Three sub-states:
 *  1. Not yet registered → last-season recap + green "register now" CTA
 *  2. Registered but not yet confirmed (entryStatus = applied) →
 *     confirmation progress bar against the threshold
 *  3. Confirmed → success card with division + season-start info
 *
 * The full-width green banner above the main content area + pulsing
 * sidebar item are rendered by AppLayout, not by this view.
 */
export function RegistrationOpenView({
  team,
  state
}: {
  team: DashboardTeam;
  state: DashboardState;
}) {
  const isApplied = state.entryStatus === "applied" || state.entryStatus === "accepted";
  const isConfirmed = state.entryStatus === "confirmed";
  const notRegistered = !state.entryStatus;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-400/40 bg-emerald-50 px-8 py-7 dark:border-emerald-700/40 dark:bg-emerald-950/30">
        <Eyebrow className="text-emerald-700 dark:text-emerald-300">
          // registration open
        </Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          {team.name}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {state.leagueName} · {state.seasonName}
        </p>

        {notRegistered ? (
          <div className="mt-4">
            <Link
              href="/captain/register"
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Register {team.name} <ArrowRight className="h-4 w-4" />
            </Link>
            {state.registrationClosesAt && (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                Closes {new Date(state.registrationClosesAt).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : null}

        {isApplied ? (
          <div className="mt-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            <span className="text-sm text-fg">
              Registration submitted — awaiting confirmation
            </span>
            <Badge tone="warning" mono>
              {state.entryStatus}
            </Badge>
          </div>
        ) : null}

        {isConfirmed ? (
          <div className="mt-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            <span className="text-sm font-medium text-fg">
              {team.name} is confirmed for {state.seasonName}!
            </span>
          </div>
        ) : null}
      </section>

      {isApplied && state.thresholdCents > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <Eyebrow>// confirmation progress</Eyebrow>
          <ProgressBar
            collected={state.collectedCents}
            threshold={state.thresholdCents}
          />
          <p className="mt-3 text-[12px] text-fg-muted">
            Your team confirms once {fmt(state.thresholdCents)} in deposits is
            collected.
          </p>
        </section>
      ) : null}

      {notRegistered ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <Eyebrow>// last season</Eyebrow>
          <p className="mt-1 text-[14px] text-fg">
            Last season stats & player highlights will surface here once the
            stats aggregate endpoint lands. For now,{" "}
            <Link
              href="/captain/register"
              className="text-accent hover:underline"
            >
              jump into the rollover wizard
            </Link>
            .
          </p>
        </section>
      ) : null}
    </div>
  );
}

function ProgressBar({
  collected,
  threshold
}: {
  collected: number;
  threshold: number;
}) {
  const pct = threshold ? Math.min(100, Math.round((collected / threshold) * 100)) : 0;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-fg-muted">
        <span>{fmt(collected)}</span>
        <span>
          {pct}% · {fmt(threshold)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-subtle">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
