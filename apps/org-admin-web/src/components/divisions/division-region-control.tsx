"use client";

import { DivisionRegionControl as SharedControl } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/browser-api";

/** org-admin binding of the shared DivisionRegionControl. */
export function DivisionRegionControl({
  divisionId,
  regionId,
  regions
}: {
  divisionId: string;
  regionId: string | null;
  regions: Array<{ id: string; name: string }>;
}) {
  return (
    <SharedControl
      regionId={regionId}
      regions={regions}
      manageHref="/org-setup"
      save={(rid) => leagueMgmt.updateDivision(divisionId, { regionId: rid }).then((d) => ({ regionId: d.regionId }))}
    />
  );
}
