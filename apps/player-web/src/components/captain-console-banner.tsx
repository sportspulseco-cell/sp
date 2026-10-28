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
    process.env.NEXT_PUBLIC_TEAM_ADMIN_URL ?? "https://team.sportspulse.us";

  return (
    <a
      href={`${teamAdminBase}/`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3 transition-colors duration-150 ease-out hover:bg-surface-2"
    >
      <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--tint-emerald-fg)]" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 text-[14px] font-medium text-fg">Captain console: roster, dues and team registration</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[--accent]">
        Open
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
    </a>
  );
}
