"use client";

import { VenuesPage, type VenuesApi } from "@sportspulse/admin-pages";
import { useCallback, useEffect, useState } from "react";
import { LoadError, PageHeader } from "@sportspulse/ui";
import * as browser from "@/lib/api/browser-api";

interface OrgRow { id: string; name: string; timezone: string }

export default function VenuesAdminPage() {
  // Typed, not cast: a renamed SDK call fails the build, not the page.
  const api: VenuesApi = browser.schedulingInventory;
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  useEffect(() => {
    browser.orgs
      .list({ limit: 100 })
      .then((res) =>
        setOrgs(res.items.map((o) => ({ id: o.id, name: o.displayName, timezone: o.defaultTimezone })))
      )
      .catch((e: Error) => {
        // Say so: an empty list here left Create disabled with no reason (SCH-9).
        console.error("[venues] orgs.list failed", e);
        setOrgsError(e.message);
      });
  }, []);
  const loadSeasons = useCallback(
    (orgId: string) =>
      browser.leagueMgmt
        .listSeasons({ orgId, limit: 100 })
        .then((res) => res.items.map((x) => ({ id: x.id, name: x.name }))),
    []
  );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Schedule"
        title="Rinks & ice time"
        description="The rinks and ice slots the schedule uses. Add a rink, then its surfaces, then single slots or a weekly pattern."
      />
      {orgsError ? (
        <LoadError what="your organizations" status={null} message={orgsError} />
      ) : null}
      <VenuesPage api={api} loadSeasons={loadSeasons} ownableOrgs={orgs} />
    </div>
  );
}
