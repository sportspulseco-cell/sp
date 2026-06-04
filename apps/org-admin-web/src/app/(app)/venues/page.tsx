"use client";

import { VenuesPage, type VenuesApi } from "@sportspulse/admin-pages";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import * as browser from "@/lib/api/browser-api";

interface OrgRow { id: string; name: string }

export default function OrgAdminVenuesPage() {
  const api = browser.schedulingInventory as unknown as VenuesApi;
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(undefined);
  useEffect(() => {
    (async () => {
      try {
        const scope = await browser.iam.meScope();
        const ids = scope.orgIds ?? [];
        if (ids.length === 0) return;
        const res = await browser.orgs.list({ limit: 200 });
        const mine = res.items.filter((o) => ids.includes(o.id));
        setOrgs(mine.map((o) => ({ id: o.id, name: o.displayName })));
        setActiveOrgId(mine[0]?.id);
      } catch {
        setOrgs([]);
      }
    })();
  }, []);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="venues"
        title="Venues, surfaces, ice slots"
        description="The inventory the scheduler reads. Add a venue, then a surface, then a single slot or a weekly recurrence."
      />
      <VenuesPage api={api} orgId={activeOrgId} ownableOrgs={orgs} />
    </div>
  );
}
