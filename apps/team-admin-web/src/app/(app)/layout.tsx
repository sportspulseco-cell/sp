import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConsoleShell } from "@/components/layout/console-shell";
import { captain, iam, leagueMgmt } from "@/lib/api/server-api";
import { getActiveTeamId } from "@/lib/active-team";
import { loadRegistrationCall } from "@/lib/captain-registration";

/**
 * Auth-gate + chrome wrapper for the Team admin app.
 *
 * Registration call-to-action: the banner under the TopBar and the
 * sidebar CTA render from one value (`loadRegistrationCall`): an open
 * season the team has not applied to, a denial to act on, a pending
 * application, or an approved one whose set-up is still to do. Never
 * one without the other. Gating on `mode === registration_open` alone
 * hid the CTA from every in-season team (CAP-6).
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

  const [profile, scope] = await Promise.all([
    iam.me(),
    iam.meScope()
  ]);

  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  // The team the console works on (a captain can hold several).
  const primaryTeamId = await getActiveTeamId(scope);
  const teams = scope?.teamIds.length
    ? (await Promise.all(scope.teamIds.map((id) => leagueMgmt.getTeam(id).catch(() => null))))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ id: t.id, name: t.name }))
    : [];
  const primaryRole = isCaptain ? "captain" : "coach";
  const roleLine = profile && scope
    ? `${primaryRole} · ${scope.teamIds.length} team${scope.teamIds.length === 1 ? "" : "s"}`
    : "loading…";

  // Mode detection — only worth fetching when there's actually a team
  // to fetch state for and the user is a captain on it.
  const dashboardState =
    isCaptain && primaryTeamId
      ? await captain.dashboardState(primaryTeamId).catch(() => null)
      : null;
  const registrationCall =
    isCaptain && primaryTeamId
      ? await loadRegistrationCall(primaryTeamId, dashboardState)
      : null;

  return (
    <ConsoleShell
      email={profile?.email ?? user.email ?? ""}
      displayName={profile?.displayName ?? null}
      roleLine={roleLine}
      isCaptain={isCaptain}
      registrationCall={registrationCall}
      teams={teams}
      activeTeamId={primaryTeamId ?? ""}
    >
      {children}
    </ConsoleShell>
  );
}
