import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavProvider } from "@/components/layout/nav-context";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { CommandPaletteTrigger } from "@/components/ui/command-palette";

// Server component layout: enforces auth + super-admin gate, fetches profile once.
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

  if (!profile?.is_super_admin) {
    redirect("/sign-in?error=wrong_role");
  }

  return (
    <NavProvider>
      <div className="flex min-h-screen bg-bg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            email={profile.email ?? user.email ?? ""}
            displayName={profile.display_name ?? null}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-container">{children}</div>
          </main>
        </div>
        <CommandPaletteTrigger />
      </div>
    </NavProvider>
  );
}
