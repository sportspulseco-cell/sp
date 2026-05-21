import { ArrowUpRight, ShieldCheck } from "lucide-react";

/**
 * Single, opinionated deep-link from player-web → team-admin-web for
 * users who hold the `captain` role on at least one team. Replaces
 * the entire `/captain/*` page tree that used to live in this app
 * (audit §1 / §2 / §6 — five byte-identical page duplicates between
 * the two surfaces).
 *
 * The captain console lives in team-admin-web — this banner is the
 * single discoverable entry point in player-web. Same Supabase
 * project, but per-origin sessions: if the captain isn't already
 * signed in on team-admin-web they'll land on its sign-in screen,
 * which sends them back here-or-there after auth.
 */
export function CaptainConsoleBanner() {
  // Defaults to the deployed URL; override with NEXT_PUBLIC_TEAM_ADMIN_URL
  // (e.g. http://localhost:3005) when running the local stack.
  const teamAdminBase =
    process.env.NEXT_PUBLIC_TEAM_ADMIN_URL ?? "https://sp-team-admin.vercel.app";

  return (
    <div className="rounded-xl border border-[var(--tint-emerald-fg)]/30 bg-[var(--success)]/[0.06] p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--tint-emerald-fg)]">
            // captain console
          </p>
          <p className="mt-0.5 text-[14px] font-medium text-fg">
            You&apos;re a captain — manage your team in the team admin console
          </p>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            Roster, invites, dues, compliance, and team registration all live there. Opens in a new tab.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-14">
        <a
          href={`${teamAdminBase}/captain/register`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--success)] px-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white hover:bg-[var(--success)]"
        >
          Register your team
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </a>
        <a
          href={`${teamAdminBase}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--tint-emerald-fg)]/30 bg-bg/40 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--tint-emerald-fg)] hover:bg-[var(--tint-emerald-bg)] dark:text-[var(--tint-emerald-fg)]"
        >
          Open team console
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}
