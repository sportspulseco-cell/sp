import { Building2 } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { admin, iam, leagueMgmt, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { OrgSetupShell } from "./org-setup-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Org setup — Org Admin" };

/**
 * Same shared @sportspulse/admin-pages OrgSetupWizard sa-web uses,
 * but locked to the caller's own org. Step 1's org picker only
 * surfaces orgs in scope.orgIds (the user's role assignments), so an
 * org_admin holding two orgs can pick between them — but never
 * outside their tenancy.
 *
 * On success the shell routes to org-admin's `/leagues/[id]` (never
 * to sa-web's URL) — the confidential super-admin URL stays
 * confidential.
 */
export default async function OrgAdminOrgSetupPage() {
  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);

  const [orgsPage, sports, governingBodies] = await Promise.all([
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null })),
    admin.listSports().catch(() => []),
    leagueMgmt.listGoverningBodies({}).catch(() => [])
  ]);

  // Defense in depth — the API already filters orgs.list to the
  // caller's scope, but explicitly clamp the picker to orgs we know
  // they hold. Bias to the active org first.
  const scopedOrgs = scope?.orgIds
    ? orgsPage.items.filter((o) => scope.orgIds.includes(o.id))
    : orgsPage.items;
  const ordered = activeOrgId
    ? [
        ...scopedOrgs.filter((o) => o.id === activeOrgId),
        ...scopedOrgs.filter((o) => o.id !== activeOrgId)
      ]
    : scopedOrgs;

  if (ordered.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Org setup" title="Org setup" />
        <EmptyState
          icon={Building2}
          title="No organization you can set up under"
          description="You don't hold an org_admin role on any organization yet. Ask the platform admin to grant you the role first."
        />
      </div>
    );
  }

  return (
    <OrgSetupShell
      orgs={ordered}
      sports={sports}
      governingBodies={governingBodies}
    />
  );
}
