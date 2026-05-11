import Link from "next/link";
import { ArrowRight, CalendarRange, Sparkles } from "lucide-react";

/**
 * Workflow 7A Phase 2 · registration-open banner.
 *
 * Renders directly under the TopBar whenever
 * `dashboardState.mode === "registration_open"`. Pairs with the
 * pulsing sidebar item — both are driven by the same flag in
 * (app)/layout.tsx so they appear and disappear simultaneously.
 *
 * Format: green tint, mono "// season open" caption, league/season
 * name, registration-closes-at countdown, primary CTA to /captain/register.
 */
export function RegistrationBanner({
  seasonName,
  leagueName,
  registrationClosesAt
}: {
  seasonName: string;
  leagueName: string;
  registrationClosesAt: string | null;
}) {
  const closesAt = registrationClosesAt
    ? new Date(registrationClosesAt)
    : null;
  const daysLeft = closesAt
    ? Math.max(
        0,
        Math.ceil((closesAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : null;
  const urgent = daysLeft !== null && daysLeft <= 3;

  return (
    <div className="relative overflow-hidden border-b border-emerald-500/20 bg-emerald-500/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
              <span className="text-emerald-700/70 dark:text-emerald-300/70">
                //
              </span>
              <span>season · open</span>
            </p>
            <p className="mt-0.5 truncate text-[14px] font-medium text-fg">
              <span className="font-semibold">{seasonName}</span>{" "}
              <span className="text-fg-muted">·</span>{" "}
              <span className="text-fg-muted">{leagueName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {daysLeft !== null ? (
            <span
              className={
                urgent
                  ? "inline-flex h-7 items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300"
                  : "inline-flex h-7 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300"
              }
            >
              <CalendarRange className="h-3 w-3" strokeWidth={2} />
              {daysLeft === 0
                ? "closes today"
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            </span>
          ) : null}
          <Link
            href="/captain/register"
            className="group inline-flex h-8 items-center gap-2 rounded-full bg-emerald-600 px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition-transform hover:scale-[1.02] hover:bg-emerald-700"
          >
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            Register the team
            <ArrowRight
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
