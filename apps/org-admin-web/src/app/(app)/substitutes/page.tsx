import { PageHeader } from "@sportspulse/ui";
import { loadMeScope } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { SubstitutesClient } from "./substitutes-client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Substitute requests · SportsPulse" };
export default async function SubstitutesPage() {
  const orgId = await getActiveOrgId(await loadMeScope());
  return <div className="space-y-6"><PageHeader title="Substitute requests" description="Review captain requests before private regional invitations are sent." />
    {orgId ? <SubstitutesClient orgId={orgId} /> : <p className="text-sm text-fg-muted">Choose an organization to review its requests.</p>}
  </div>;
}
