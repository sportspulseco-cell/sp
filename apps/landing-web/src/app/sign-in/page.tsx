import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — SportsPulse",
  description: "One place to sign in. Pick what you do in your league and we send you to the right app."
};

const SUPERADMIN = process.env.NEXT_PUBLIC_SUPERADMIN_URL ?? "https://superadmin.sportspulse.us";
const ORG_ADMIN = process.env.NEXT_PUBLIC_ORG_ADMIN_URL ?? "https://org.sportspulse.us";
const TEAM_ADMIN = process.env.NEXT_PUBLIC_TEAM_ADMIN_URL ?? "https://team.sportspulse.us";
const PLAYER = process.env.NEXT_PUBLIC_PLAYER_URL ?? "https://player.sportspulse.us";

/**
 * Single entry point (PPHL, 24 Oct 2026: "so many modules and
 * subdomains, which I don't understand"). Four apps keep their own
 * sign-in, so this page only asks one plain question and forwards.
 */
const DESTINATIONS = [
  {
    title: "I run the league",
    who: "League administrators and platform admins",
    does: "Seasons, divisions, registration, team applications, schedule, standings, payments, messages.",
    base: SUPERADMIN,
    cta: "Open the admin console"
  },
  {
    title: "I run a club or organisation",
    who: "Organisation administrators",
    does: "Your organisation's leagues, seasons, teams, registrations and invoices.",
    base: ORG_ADMIN,
    cta: "Open the organisation console"
  },
  {
    title: "I captain or coach a team",
    who: "Captains, coaches, team managers",
    does: "Register the team, build the roster, invite players, dues, lineups, schedule.",
    base: TEAM_ADMIN,
    cta: "Open the team app"
  },
  {
    title: "I play (or I am a parent)",
    who: "Players, free agents, parents of minors",
    does: "Register for a season, sign waivers, pay, see your schedule and stats.",
    base: PLAYER,
    cta: "Open the player app"
  }
];

export default function SignInChooser() {
  return (
    <main className="mx-auto max-w-container px-6 py-20 lg:px-10 lg:py-28">
      <p className="font-mono text-[12px] uppercase tracking-widest text-fg-muted">// Sign in</p>
      <h1 className="mt-4 max-w-[18ch] text-[clamp(36px,6vw,72px)] font-semibold leading-[0.96] tracking-tighter text-fg">
        What do you do in your league?
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
        SportsPulse is one platform with an app per role. Pick yours and sign in there. If you hold several
        roles, each app signs you in with the same email and password.
      </p>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {DESTINATIONS.map((d) => (
          <li key={d.title} className="flex flex-col rounded-2xl border border-border bg-surface-1 p-6">
            <h2 className="text-[20px] font-semibold tracking-tight text-fg">{d.title}</h2>
            <p className="mt-1 text-[12px] font-medium text-fg-muted">{d.who}</p>
            <p className="mt-3 flex-1 text-[14px] leading-relaxed text-fg-muted">{d.does}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={`${d.base}/sign-in`}
                className="inline-flex items-center rounded-full bg-fg px-5 py-2 font-mono text-[12px] font-medium uppercase tracking-widest text-bg"
              >
                {d.cta}
              </Link>
              <Link href={`${d.base}/sign-up`} className="text-[13px] text-fg-muted underline-offset-4 hover:underline">
                New here? Create an account
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-[13px] text-fg-muted">
        Not sure which one? Players and parents use the player app; captains the team app; anyone who
        sets up seasons, reviews registrations or builds schedules uses the admin console.
      </p>
    </main>
  );
}
