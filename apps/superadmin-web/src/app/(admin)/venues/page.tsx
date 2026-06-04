"use client";

import { VenuesPage, type VenuesApi } from "@sportspulse/admin-pages";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import * as browser from "@/lib/api/browser-api";

interface OrgRow { id: string; name: string }

export default function VenuesAdminPage() {
  const api = browser.schedulingInventory as unknown as VenuesApi;
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  useEffect(() => {
    browser.orgs
      .list({ limit: 100 })
      .then((res) => setOrgs(res.items.map((o) => ({ id: o.id, name: o.displayName }))))
      .catch(() => setOrgs([]));
  }, []);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="venues"
        title="Venues, surfaces, ice slots"
        description="The inventory the scheduler reads. Add a venue, then a surface (rink / sheet), then a single slot or a weekly recurrence. ON-CONFLICT silently skips slots that already exist on the same surface + start instant."
      />
      <VenuesPage api={api} ownableOrgs={orgs} />
    </div>
  );
}
