import { Building2 } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { admin, leagueMgmt, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { OrgSetupWizard } from "./org-setup-wizard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Org setup — SportsPulse" };

export default async function OrgSetupPage() {
  // Bootstrap dropdown data once, on the server. Subsequent dependent
  // dropdowns (governing-bodies-by-sport, age-groups-by-body) load
  // from the client as the admin makes selections.
  const [orgsPage, sports, governingBodies] = await Promise.all([
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null })),
    admin.listSports().catch(() => []),
    leagueMgmt.listGoverningBodies({}).catch(() => [])
  ]);

  if (orgsPage.items.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Org setup" title="Org setup" />
        <EmptyState
          icon={Building2}
          title="No organizations to set up under"
          description="Create an organization first — the wizard nests a new league + season + divisions under it."
        />
      </div>
    );
  }

  return (
    <OrgSetupWizard
      orgs={orgsPage.items}
      sports={sports}
      governingBodies={governingBodies}
    />
  );
}
