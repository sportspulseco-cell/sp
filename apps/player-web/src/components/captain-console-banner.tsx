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
    <a
      href={`${teamAdminBase}/`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.10]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
          // captain console
        </p>
        <p className="mt-0.5 text-[14px] font-medium text-fg">
          You&apos;re a captain — open the team admin console
        </p>
        <p className="mt-0.5 text-[12px] text-fg-muted">
          Roster, invites, dues, compliance, and team registration all live there. Opens in a new tab.
        </p>
      </div>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-fg-muted transition-colors group-hover:text-fg"
        strokeWidth={1.75}
      />
    </a>
  );
}
