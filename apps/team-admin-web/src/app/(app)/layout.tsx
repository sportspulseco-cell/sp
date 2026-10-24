import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { captain, iam } from "@/lib/api/server-api";
import { NavProvider } from "@/components/layout/nav-context";
import { RegistrationBanner } from "@/components/layout/registration-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
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
  const primaryTeamId = scope?.teamIds[0] ?? null;
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
    <NavProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar isCaptain={isCaptain} registrationCall={registrationCall} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            email={profile?.email ?? user.email ?? ""}
            displayName={profile?.displayName ?? null}
            roleLine={roleLine}
            isCaptain={isCaptain}
          />
          {registrationCall ? (
            <RegistrationBanner call={registrationCall} />
          ) : null}
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </NavProvider>
  );
}
