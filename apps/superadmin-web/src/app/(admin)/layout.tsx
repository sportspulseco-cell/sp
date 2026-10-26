import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NavProvider } from "@/components/layout/nav-context";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
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
    <NavProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar isSuperAdmin={viewer.isSuperAdmin} mode={viewer.mode} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            email={viewer.email}
            displayName={viewer.displayName}
            officialMode={viewer.mode === "official"}
          />
          {/* pb-24 keeps the last row (form submit bars) clear of the fixed
              command-palette button, which used to swallow clicks on
              "Create and send". */}
          <main className="flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
            <div className="mx-auto max-w-container">{children}</div>
          </main>
        </div>
        {viewer.mode === "admin" ? <CommandPaletteTrigger /> : null}
      </div>
    </NavProvider>
  );
}
