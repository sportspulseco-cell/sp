import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConsoleShell } from "@/components/layout/console-shell";
import { iam, orgs } from "@/lib/api/server-api";
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

  const [profile, scope] = await Promise.all([
    iam.me(),
    iam.meScope()
  ]);
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
    ? `org admin · ${scope.orgIds.length} org${scope.orgIds.length === 1 ? "" : "s"}`
    : "loading…";

  return (
    <ConsoleShell
      email={profile?.email ?? user.email ?? ""}
      displayName={profile?.displayName ?? null}
      roleLine={roleLine}
      orgs={switcherOrgs}
      activeOrgId={activeOrgId ?? ""}
    >
      {children}
    </ConsoleShell>
  );
}
