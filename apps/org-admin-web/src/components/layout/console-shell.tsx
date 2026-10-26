"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { AppShell } from "@sportspulse/ui";
import { createClient } from "@/lib/supabase/client";
import { OrgSwitcher } from "./org-switcher";
import { HOME, NAV, ROUTES } from "./nav-config";

const BRAND = { name: "SportsPulse", console: "Org admin", icon: Building2 };

/** Organization console chrome, from the shared shell. */
export function ConsoleShell({
  email,
  displayName,
  roleLine,
  orgs,
  activeOrgId,
  children
}: {
  email: string;
  displayName: string | null;
  roleLine: string;
  /** Empty or single-org: the switcher renders nothing. */
  orgs: Array<{ id: string; displayName: string }>;
  activeOrgId: string;
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
      actions={<OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />}
      onSignOut={signOut}
    >
      {children}
    </AppShell>
  );
}
