import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { iam } from "@/lib/api/server-api";
import { NavProvider } from "@/components/layout/nav-context";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

/**
 * Auth + role gate for the league-admin app.
 * Allows: super_admin (everything) or any user with at least one active
 * league_admin role assignment. The league context — which leagues this
 * principal can manage — is derived from those assignments and surfaced
 * via the LeagueSwitcher in the topbar.
 */
export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?error=session_expired");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_super_admin, status")
    .eq("id", user.id)
    .single();

  // Fetch the principal's active role assignments via the self-endpoint
  // (no super_admin required — every authenticated user reads their own).
  const assignments = await iam.myActiveRoles().catch(() => []);

  const leagueAssignments = assignments.filter(
    (a) =>
      (a.role?.code === "league_admin" ||
        a.role?.code === "super_admin" ||
        a.role?.code === "org_admin") &&
      (a.scopeType === "league" || a.scopeType === "platform" || a.scopeType === "org")
  );

  // Authorization rule: super_admin OR any league/org/platform-scoped admin role.
  const allowed =
    profile?.is_super_admin === true || leagueAssignments.length > 0;

  if (!allowed) {
    redirect("/sign-in?error=not_authorized");
  }

  // Distinct league IDs the principal can manage (super_admin = all, deferred
  // to the API on each list call).
  const manageableLeagueIds = leagueAssignments
    .filter((a) => a.scopeType === "league" && a.scopeId)
    .map((a) => a.scopeId as string);

  return (
    <NavProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            email={profile?.email ?? user.email ?? ""}
            displayName={profile?.display_name ?? null}
            isSuperAdmin={profile?.is_super_admin === true}
            manageableCount={
              profile?.is_super_admin ? "all" : String(manageableLeagueIds.length)
            }
          />
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-container">{children}</div>
          </main>
        </div>
      </div>
    </NavProvider>
  );
}
