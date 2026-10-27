"use client";

import { useRouter } from "next/navigation";
import { OrgSetupWizard } from "@sportspulse/admin-pages";
import type { GoverningBody, Org, Sport } from "@sportspulse/api-client";
import { fetchAll } from "@sportspulse/api-client";
import { NewOrgInline } from "@/components/orgs/new-org-inline";
import { leagueMgmt } from "@/lib/api/browser-api";
import { navigateInPlace } from "@sportspulse/ui";

/**
 * Sa-web binding for the shared @sportspulse/admin-pages OrgSetupWizard.
 * Injects sa-web's browser-api leagueMgmt callbacks and routes to
 * sa-web's /leagues/[id] on success.
 */
export function OrgSetupShell({
  orgs,
  sports,
  governingBodies,
  orgSports
}: {
  orgs: Org[];
  sports: Sport[];
  governingBodies: GoverningBody[];
  orgSports: Record<string, string>;
}) {
  const router = useRouter();
  return (
    <OrgSetupWizard
      orgs={orgs}
      sports={sports}
      governingBodies={governingBodies}
      orgSports={orgSports}
      createLeague={(input) =>
        leagueMgmt.createLeague(
          input as Parameters<typeof leagueMgmt.createLeague>[0]
        )
      }
      createSeason={(input) => leagueMgmt.createSeason(input)}
      createDivision={(input) => leagueMgmt.createDivision(input)}
      listRegions={(orgId) => leagueMgmt.listRegions({ orgId }).then((r) => r.items)}
      createRegion={(input) => leagueMgmt.createRegion(input)}
      renderCreateOrg={(onCreated, onCancel) => (
        <NewOrgInline onCreated={onCreated} onCancel={onCancel} />
      )}
      listLeagues={(orgId) =>
        fetchAll((cursor) => leagueMgmt.listLeagues({ orgId, limit: 100, cursor })).then((p) => p.items)
      }
      listSeasons={(leagueId) =>
        fetchAll((cursor) => leagueMgmt.listSeasons({ leagueId, limit: 100, cursor })).then((p) => p.items)
      }
      changeLeagueStatus={(id, status) =>
        leagueMgmt.changeLeagueStatus(id, status)
      }
      onComplete={({ leagueId }) => {
        navigateInPlace((h) => router.push(h), `/leagues/${leagueId}`, 8000);
        // No router.refresh() here: it can cancel the push and leave the
        // user on this form (J11). The new page loads fresh server data.
      }}
    />
  );
}
