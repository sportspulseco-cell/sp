"use client";

import { DivisionRegionControl as SharedControl } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Region } from "@/lib/api/types";

/** sa-web binding of the shared DivisionRegionControl. */
export function DivisionRegionControl({
  divisionId,
  regionId,
  regions,
  orgHref
}: {
  divisionId: string;
  regionId: string | null;
  regions: Region[];
  orgHref: string | null;
}) {
  return (
    <SharedControl
      regionId={regionId}
      regions={regions.map((r) => ({ id: r.id, name: r.name }))}
      manageHref={orgHref}
      save={(rid) => leagueMgmt.updateDivision(divisionId, { regionId: rid }).then((d) => ({ regionId: d.regionId }))}
    />
  );
}
