"use client";

import { useRouter } from "next/navigation";
import { OrgSetupWizard } from "@sportspulse/admin-pages";
import type { GoverningBody, Org, Sport } from "@sportspulse/api-client";
import { leagueMgmt } from "@/lib/api/browser-api";

/**
 * Org-admin binding for the shared OrgSetupWizard. Same wizard sa-web
 * mounts; the only difference is the SDK calls flow through org-admin
 * scope (org_admin via @AllowScopedWrite + in-handler org checks on
 * the create endpoints) and onComplete routes to org-admin's own
 * `/leagues/[id]`. The sp-superadmin URL never appears.
 */
export function OrgSetupShell({
  orgs,
  sports,
  governingBodies
}: {
  orgs: Org[];
  sports: Sport[];
  governingBodies: GoverningBody[];
}) {
  const router = useRouter();
  return (
    <OrgSetupWizard
      orgs={orgs}
      sports={sports}
      governingBodies={governingBodies}
      createLeague={(input) =>
        leagueMgmt.createLeague(
          input as Parameters<typeof leagueMgmt.createLeague>[0]
        )
      }
      createSeason={(input) => leagueMgmt.createSeason(input)}
      createDivision={(input) => leagueMgmt.createDivision(input)}
      changeLeagueStatus={(id, status) =>
        leagueMgmt.changeLeagueStatus(id, status)
      }
      onComplete={({ leagueId }) => {
        router.push(`/leagues/${leagueId}`);
        router.refresh();
      }}
    />
  );
}
