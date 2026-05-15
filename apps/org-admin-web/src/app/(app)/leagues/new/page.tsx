import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { Building2 } from "lucide-react";
import { iam, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { NewLeagueForm } from "./new-league-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "New league — Org admin" };

/**
 * Backlog #17b — first concrete write surface in org-admin-web.
 * Org-admins kick off setup by creating their first league here
 * instead of asking a super-admin.
 */
export default async function NewLeaguePage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// New league" title="Create a league" />
        <EmptyState
          icon={Building2}
          title="No org in scope"
          description="Pick an org from the switcher first."
        />
      </div>
    );
  }

  const org = await orgs.get(orgId).catch(() => null);

  return (
    <div className="space-y-6">
      <Link
        href="/leagues"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All leagues
      </Link>
      <PageHeader
        eyebrow="// New league"
        title={`Create a league for ${org?.displayName ?? "your org"}`}
        description="Leagues hold seasons → divisions → teams. Add seasons + divisions from the super-admin console once the league exists; that wiring lands in #6."
      />
      <NewLeagueForm orgId={orgId} orgName={org?.displayName ?? "your org"} />
    </div>
  );
}
