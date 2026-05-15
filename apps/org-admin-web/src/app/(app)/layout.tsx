import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { iam, orgs } from "@/lib/api/server-api";
import { NavProvider } from "@/components/layout/nav-context";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { getActiveOrgId } from "@/lib/active-org";

/**
 * Auth-gate + chrome wrapper for the Org admin app.
 * Pulls the user's scope, resolves the active org (cookie-backed
 * with `scope.orgIds[0]` fallback), and feeds the topbar an
 * org-switcher dropdown when the user holds 2+ orgs.
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
  const activeOrgId = await getActiveOrgId(scope);

  // Friendly labels for the switcher — one /orgs/:id per scope
  // entry. Federation owners typically have <5 orgs so the
  // round-trip cost is trivial; results are cached per request.
  const scopedOrgs = scope?.orgIds.length
    ? (
        await Promise.all(
          scope.orgIds.map((id) => orgs.get(id).catch(() => null))
        )
      ).filter((o): o is NonNullable<typeof o> => !!o)
    : [];
  const switcherOrgs = scopedOrgs.map((o) => ({
    id: o.id,
    displayName: o.displayName
  }));

  const roleLine = profile && scope
    ? `org_admin · ${scope.orgIds.length} org${scope.orgIds.length === 1 ? "" : "s"}`
    : "loading…";

  return (
    <NavProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            email={profile?.email ?? user.email ?? ""}
            displayName={profile?.displayName ?? null}
            roleLine={roleLine}
            orgs={switcherOrgs}
            activeOrgId={activeOrgId ?? ""}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </NavProvider>
  );
}
