import { Star, Users } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { captain, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { OffSeasonView } from "@/components/dashboard/off-season-view";
import { RegistrationOpenView } from "@/components/dashboard/registration-open-view";
import { InSeasonView } from "@/components/dashboard/in-season-view";
import { PostSeasonView } from "@/components/dashboard/post-season-view";

export const dynamic = "force-dynamic";

/**
 * Workflow 7C §6 — Captain dashboard with 4 seasonal modes.
 *
 * Single URL. The mode is fetched once via /captain/dashboard-state
 * on every load and the rendered tree switches accordingly. The
 * shell (top bar + sidebar) is kept stable in (app)/layout.tsx.
 */
export default async function TeamAdminHome() {
  const scope = await iam.meScope().catch(() => null);
  const myTeamId = scope?.teamIds[0] ?? null;
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  if (!scope || !myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Team admin" title="Your team" />
        <EmptyState
          icon={Users}
          title="No team in scope"
          description={
            scope
              ? "Your account isn't on a team roster yet. Ask your league admin to add you to a team."
              : "We couldn't load your account. Try signing out and back in."
          }
        />
      </div>
    );
  }

  if (!isCaptain) {
    // Non-captain team-admin / coach — show a lightweight overview only.
    const team = await leagueMgmt.getTeam(myTeamId).catch(() => null);
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Team admin"
          title={team?.name ?? "Your team"}
          description="Access roster, schedule, and stats from the sidebar."
        />
        <EmptyState
          icon={Star}
          title="Captain dashboard hidden"
          description="The 4-mode captain dashboard renders for users holding the captain role on this team."
        />
      </div>
    );
  }

  const [team, state] = await Promise.all([
    leagueMgmt.getTeam(myTeamId).catch(() => null),
    captain.dashboardState(myTeamId).catch(() => null)
  ]);

  if (!team || !state) {
    return (
      <EmptyState
        icon={Star}
        title="Couldn't load your dashboard"
        description="Try refreshing. If the problem persists, contact your league admin."
      />
    );
  }

  let dashboard;
  switch (state.mode) {
    case "off_season":
      dashboard = <OffSeasonView team={team} state={state} />;
      break;
    case "registration_open":
      dashboard = <RegistrationOpenView team={team} state={state} />;
      break;
    case "applied":
    case "in_season":
      dashboard = <InSeasonView team={team} state={state} />;
      break;
    case "post_season":
      dashboard = <PostSeasonView team={team} state={state} />;
      break;
    default:
      dashboard = <OffSeasonView team={team} state={state} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="// Team workspace" title={team.name} />
      {dashboard}
    </div>
  );
}
