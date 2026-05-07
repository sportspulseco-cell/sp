import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { iam } from "@/lib/api/server-api";
import { NavProvider } from "@/components/layout/nav-context";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

/**
 * Auth-gate + chrome wrapper for the Org admin app.
 * The middleware already verifies role + profile completion; this
 * layout pulls the freshly-authenticated user's profile + scope
 * to render the topbar's role / count line.
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

  const roleLine = profile && scope
    ? `org_admin · ${scope.orgIds.length} orgs`
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
          />
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </NavProvider>
  );
}
