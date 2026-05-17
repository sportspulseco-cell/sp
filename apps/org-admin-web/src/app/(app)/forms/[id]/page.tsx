import { FileSignature } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Form builder — Org Admin" };

/**
 * BUG-043 step 9 — org-admin /forms/[id] route skeleton.
 *
 * The shared @sportspulse/forms-builder package now contains the
 * canonical form-build UI. The org-admin consumer-side wiring (this
 * page + forms-builder-provider-client.tsx + the browser-api exports
 * of registration/registrationV2/leagueMgmt) is in place — but the
 * API-side work to make org-admin's session actually pass the
 * guards on those endpoints is still pending.
 *
 * Today this page renders an honest placeholder + the path to the
 * checklist. When the proxy/relax work in doc/bug-043-followup.md
 * lands, this body gets replaced with the same server-fetch +
 * mount-shared-components flow sa-web uses today.
 */
export default async function OrgAdminFormSetupPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Forms · setup"
        title="Form builder"
        description="The shared form-builder UI lives in @sportspulse/forms-builder and works in this app — but the API endpoints it calls still require super_admin. Org-admin form editing lands once the proxy work in doc/bug-043-followup.md ships."
      />
      <EmptyState
        icon={FileSignature}
        title="Org-admin form editing is wired up but not yet enabled"
        description={`Form id: ${id}. The shared form-builder package is consumed by this app, but mutation endpoints (createFormVersion, updatePricingTier, etc.) currently require super_admin. Editing for org-admins lands once the BUG-043 follow-up endpoints are proxied. Until then, edits flow through your platform admin.`}
      />
    </div>
  );
}
