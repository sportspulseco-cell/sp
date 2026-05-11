import Link from "next/link";
import { ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { captain, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { RegisterWizard } from "./register-wizard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Register the team — SportsPulse" };

/**
 * Workflow 7A Phase 2 entry · /captain/register
 *
 * Gates the rollover wizard on three things:
 *   1. caller is a captain on at least one team (scope check)
 *   2. that team's dashboard-state is `registration_open` (a season's
 *      registration window is currently open in the team's org), or
 *      `applied` (continue an already-submitted entry)
 *   3. divisions exist on the open season — otherwise the league
 *      admin hasn't finished /org-setup yet and there's nothing to
 *      apply for.
 *
 * Each gate failure renders a contextual EmptyState rather than
 * silently 404-ing, so the captain knows exactly what's missing.
 */
export default async function CaptainRegisterPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const teamId = scope?.teamIds[0] ?? null;

  if (!isCaptain || !teamId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// captain console"
          title="Register the team"
        />
        <EmptyState
          icon={ShieldAlert}
          title="Captain role required"
          description="Only the team's elected captain can run the season rollover. Ask your league admin to assign you the captain role."
        />
      </div>
    );
  }

  const [team, state] = await Promise.all([
    leagueMgmt.getTeam(teamId).catch(() => null),
    captain.dashboardState(teamId).catch(() => null)
  ]);

  if (!team || !state) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// captain console"
          title="Register the team"
        />
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load your team"
          description="Something went wrong loading the team record. Refresh and try again — if it persists, contact your league admin."
        />
      </div>
    );
  }

  // Already applied — surface a "watch progress" stub. Step 4 + the
  // confirmation watcher land in Sprint 4, so for now we just point
  // the captain back to their team page.
  if (state.mode === "applied" || state.mode === "in_season") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// captain console"
          title="You're already registered"
          description={`${team.name} is signed up for ${state.seasonName ?? "this season"}. Watch confirmation progress on your team dashboard.`}
        />
        <div className="rounded-xl border border-border bg-bg-subtle p-6 text-[13px] text-fg-muted">
          <p>
            Status:{" "}
            <span className="font-mono text-fg">
              {state.entryStatus ?? "pending"}
            </span>
          </p>
          <p className="mt-1">
            Threshold:{" "}
            <span className="font-mono text-fg">
              ${(state.thresholdCents / 100).toFixed(2)}
            </span>{" "}
            · Collected:{" "}
            <span className="font-mono text-fg">
              ${(state.collectedCents / 100).toFixed(2)}
            </span>
          </p>
          <Link
            href="/captain/team"
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-fg px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.02]"
          >
            Open team dashboard
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </div>
      </div>
    );
  }

  if (state.mode !== "registration_open" || !state.seasonId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// captain console"
          title="Registration isn't open"
          description="No season in your league has its registration window open right now. We'll surface the green banner here automatically when it does."
        />
        <EmptyState
          icon={Sparkles}
          title="Off-season"
          description="The next opening will appear at the top of every page as a green pulsing banner the moment registration opens."
        />
      </div>
    );
  }

  // Open season + divisions. Hand off to the client wizard.
  const divsResp = await captain.listDivisions(state.seasonId).catch(() => null);
  if (!divsResp || divsResp.items.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// captain console"
          title="Almost ready"
          description={`Registration for ${state.seasonName} is open, but the league admin hasn't configured divisions yet. We'll let you know the moment they do.`}
        />
        <EmptyState
          icon={Sparkles}
          title="Waiting on league setup"
          description="A division must exist before you can register. Hold tight — your league admin is on it."
        />
      </div>
    );
  }

  // Make sure the team-creation date pre-dates the season's start, etc.
  // For Sprint 3 we trust the league admin's setup and just go.
  // If a user landed here via the banner, redirect to step 1 with the
  // wizard already mounted.
  return (
    <RegisterWizard
      team={team}
      season={{
        id: state.seasonId,
        name: state.seasonName ?? "Season",
        registrationClosesAt: state.registrationClosesAt
      }}
      league={{ id: state.leagueId ?? "", name: state.leagueName ?? "" }}
      divisions={divsResp.items}
      thresholdCents={state.thresholdCents}
    />
  );
}
