"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { User } from "lucide-react";
import { AppShell, RolePill } from "@sportspulse/ui";
import { createClient } from "@/lib/supabase/client";
import { TeamSwitcher } from "./team-switcher";
import { HOME, NAV, ROUTES } from "./nav-config";

const BRAND = { name: "SportsPulse", console: "Player", icon: User };

/** Player console chrome, from the shared shell. */
export function ConsoleShell({
  email,
  displayName,
  roleLine,
  isCaptain,
  teams,
  activeTeamId,
  children
}: {
  email: string;
  displayName: string | null;
  roleLine: string;
  isCaptain: boolean;
  teams: Array<{id:string;name:string}>;
  activeTeamId: string;
  children: ReactNode;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/sign-in?error=signed_out");
    router.refresh();
  }

  return (
    <AppShell
      brand={BRAND}
      sections={NAV}
      routes={ROUTES}
      home={HOME}
      user={{ email, displayName, roleLine }}
      badge={isCaptain ? <RolePill label="Captain" title="You hold the captain role for your team" /> : undefined}
      leading={<TeamSwitcher teams={teams} activeTeamId={activeTeamId}/>}
      onSignOut={signOut}
    >
      {children}
    </AppShell>
  );
}
