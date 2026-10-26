import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConsoleShell } from "@/components/layout/console-shell";
import { CommandPaletteTrigger } from "@/components/ui/command-palette";
import { getConsoleViewer, officialMayOpen } from "@/lib/console-mode";

// Server component layout: enforces auth + the console gate, fetches profile once.
export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const viewer = await getConsoleViewer();
  if (!viewer) redirect("/sign-in?error=session_expired");

  // Admins (platform / org / league / season / division) get the
  // role-filtered console. league-admin-web was deleted in P5-D: league
  // admins land here too (CLAUDE.md "every app is just filtered by
  // role"). Game-day officials (scorekeeper, referee, or a crew spot on a
  // game) get only their games and the scoresheet (SCH-12, PPHL 7.1).
  if (!viewer.mode) redirect("/sign-in?error=wrong_role");

  if (viewer.mode === "official") {
    const pathname = (await headers()).get("x-pathname") ?? "/games";
    if (!officialMayOpen(pathname)) redirect("/games");
  }

  return (
    <ConsoleShell
      email={viewer.email}
      displayName={viewer.displayName}
      isSuperAdmin={viewer.isSuperAdmin}
      officialMode={viewer.mode === "official"}
    >
      {children}
      {viewer.mode === "admin" ? <CommandPaletteTrigger /> : null}
    </ConsoleShell>
  );
}
