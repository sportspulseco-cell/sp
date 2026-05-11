import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { captain, iam } from "@/lib/api/server-api";
import { NavProvider } from "@/components/layout/nav-context";
import { RegistrationBanner } from "@/components/layout/registration-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

/**
 * Auth-gate + chrome wrapper for the Team admin app.
 *
 * Workflow 7A Phase 2 hook: when the captain's primary team is in
 * `registration_open` mode, the top-of-page green banner AND the
 * sidebar's pulsing "Register the team" entry render at the same
 * time (driven by the same `mode` flag — never one without the other).
 */
export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?error=session_expired");

  const profile = await iam.me().catch(() => null);
  const scope = await iam.meScope().catch(() => null);

  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const primaryTeamId = scope?.teamIds[0] ?? null;
  const primaryRole = scope?.roleCodes.includes("team_admin")
    ? "team_admin"
    : isCaptain
      ? "captain"
      : "coach";
  const roleLine = profile && scope
    ? `${primaryRole} · ${scope.teamIds.length} team${scope.teamIds.length === 1 ? "" : "s"}`
    : "loading…";

  // Mode detection — only worth fetching when there's actually a team
  // to fetch state for and the user is a captain on it.
  const dashboardState =
    isCaptain && primaryTeamId
      ? await captain.dashboardState(primaryTeamId).catch(() => null)
      : null;

  return (
    <NavProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar
          isCaptain={isCaptain}
          registrationOpen={dashboardState?.mode === "registration_open"}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            email={profile?.email ?? user.email ?? ""}
            displayName={profile?.displayName ?? null}
            roleLine={roleLine}
            isCaptain={isCaptain}
          />
          {dashboardState?.mode === "registration_open" ? (
            <RegistrationBanner
              seasonName={dashboardState.seasonName ?? "season"}
              leagueName={dashboardState.leagueName ?? "league"}
              registrationClosesAt={dashboardState.registrationClosesAt}
            />
          ) : null}
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </NavProvider>
  );
}
