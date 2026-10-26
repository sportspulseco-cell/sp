import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConsoleShell } from "@/components/layout/console-shell";
import { iam } from "@/lib/api/server-api";

/**
 * Player app shell — sidebar + topbar + auth gate.
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

  const [profile, scope] = await Promise.all([
    iam.me(),
    iam.meScope()
  ]);

  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const roleLine = profile && scope
    ? `${isCaptain ? "captain" : "player"} · ${scope.teamIds.length} team${scope.teamIds.length === 1 ? "" : "s"}`
    : "loading…";

  return (
    <ConsoleShell
      email={profile?.email ?? user.email ?? ""}
      displayName={profile?.displayName ?? null}
      roleLine={roleLine}
      isCaptain={isCaptain}
    >
      {children}
    </ConsoleShell>
  );
}
