"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { UsersRound } from "lucide-react";
import { AppShell, RolePill } from "@sportspulse/ui";
import { createClient } from "@/lib/supabase/client";
import type { RegistrationCall } from "@/lib/registration-call";
import { RegistrationBanner } from "./registration-banner";
import { CAPTAIN_NAV, COACH_NAV, HOME, ROUTES } from "./nav-config";

const BRAND = { name: "SportsPulse", console: "Team admin", icon: UsersRound };

/**
 * Team console chrome, from the shared shell.
 *
 * Registration call-to-action: one banner under the top bar, on every
 * page, from one value (`registrationCall`) (CAP-6). The sidebar card
 * and the home card that repeated it were removed (doc/design/guided-ui.md:
 * one call, one place).
 */
export function ConsoleShell({
  email,
  displayName,
  roleLine,
  isCaptain,
  registrationCall,
  children
}: {
  email: string;
  displayName: string | null;
  roleLine: string;
  isCaptain: boolean;
  registrationCall: RegistrationCall | null;
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
      sections={isCaptain ? CAPTAIN_NAV : COACH_NAV}
      routes={ROUTES}
      home={HOME}
      user={{ email, displayName, roleLine }}
      badge={isCaptain ? <RolePill label="Captain" title="You hold the captain role for this team" /> : undefined}
      banner={registrationCall ? <RegistrationBanner call={registrationCall} /> : undefined}
      onSignOut={signOut}
    >
      {children}
    </AppShell>
  );
}
