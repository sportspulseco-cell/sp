"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CircleDot, Gauge } from "lucide-react";
import { AppShell, type ShellNavSection } from "@sportspulse/ui";
import { createClient } from "@/lib/supabase/client";
import { leagueMgmt, orgs, registration } from "@/lib/api/browser-api";
import { HOME, ROUTES, navFor } from "./nav-config";

const BRAND = { name: "SportsPulse", console: "Platform admin", icon: Gauge };
const OFFICIAL_HOME = { href: "/games", label: "My games" };
const NO_NAV: ShellNavSection[] = [];

/**
 * Where an id in the path gets its name when the page did not supply
 * one. Each read is the record's own scope-checked GET, so a name the
 * caller may not see comes back as a 404 and the crumb stays "Details".
 */
const NAME_BY_SECTION: Record<string, (id: string) => Promise<string>> = {
  organizations: async (id) => (await orgs.get(id)).displayName,
  leagues: async (id) => (await leagueMgmt.getLeague(id)).name,
  seasons: async (id) => (await leagueMgmt.getSeason(id)).name,
  divisions: async (id) => (await leagueMgmt.getDivision(id)).name,
  teams: async (id) => (await leagueMgmt.getTeam(id)).name,
  forms: async (id) => (await registration.getForm(id)).name,
  // The schedule pages sit under /scheduling/:seasonId.
  scheduling: async (id) => (await leagueMgmt.getSeason(id)).name
};

async function resolveName(section: string, id: string): Promise<string | null> {
  const read = NAME_BY_SECTION[section];
  return read ? read(id) : null;
}

/** Super-admin console chrome, from the shared shell. */
export function ConsoleShell({
  email,
  displayName,
  isSuperAdmin,
  officialMode,
  children
}: {
  email: string;
  displayName: string | null;
  isSuperAdmin: boolean;
  /** Game-day officials: no module navigation, one link to their games. */
  officialMode: boolean;
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
      sections={officialMode ? NO_NAV : navFor(isSuperAdmin)}
      routes={ROUTES}
      home={officialMode ? OFFICIAL_HOME : HOME}
      siteMapHref="/site-map"
      hideSidebar={officialMode}
      user={{
        email,
        displayName,
        roleLine: officialMode ? "game official" : isSuperAdmin ? "super admin" : "admin"
      }}
      leading={
        officialMode ? (
          <Link
            href="/games"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-surface-1 px-3 text-[13px] font-medium text-fg transition-colors duration-fast ease-ease hover:bg-surface-2"
          >
            <CircleDot className="h-4 w-4" strokeWidth={1.75} />
            My games
          </Link>
        ) : undefined
      }
      onSignOut={signOut}
      resolveName={resolveName}
    >
      {children}
    </AppShell>
  );
}
