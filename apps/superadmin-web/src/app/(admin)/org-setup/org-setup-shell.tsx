"use client";

import { useRouter } from "next/navigation";
import { OrgSetupWizard } from "@sportspulse/admin-pages";
import type { GoverningBody, Org, Sport } from "@sportspulse/api-client";
import { leagueMgmt } from "@/lib/api/browser-api";

/**
 * Sa-web binding for the shared @sportspulse/admin-pages OrgSetupWizard.
 * Injects sa-web's browser-api leagueMgmt callbacks and routes to
 * sa-web's /leagues/[id] on success.
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
