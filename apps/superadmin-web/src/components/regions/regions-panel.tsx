"use client";

import { RegionsPanel as SharedRegionsPanel, type RegionRow } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/browser-api";

/** sa-web binding of the shared RegionsPanel to its browser SDK. */
export function RegionsPanel({ orgId, initial }: { orgId: string; initial: RegionRow[] }) {
  return (
    <SharedRegionsPanel
      initial={initial}
      api={{
        list: (status) => leagueMgmt.listRegions({ orgId, status }).then((r) => r.items),
        create: (name) => leagueMgmt.createRegion({ orgId, name }),
        rename: (id, name) => leagueMgmt.updateRegion(id, { name }),
        archive: (id) => leagueMgmt.archiveRegion(id),
        restore: (id) => leagueMgmt.updateRegion(id, { status: "active" })
      }}
    />
  );
}
