import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { NewTeamForm } from "./new-team-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "New team — Org admin" };

export default async function NewTeamPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// New team" title="Create a team" />
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
        href="/teams"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All teams
      </Link>
      <PageHeader
        eyebrow="// New team"
        title={`Add a team to ${org?.displayName ?? "your org"}`}
        description="Teams stay loose under the org; entering a division happens later via the captain's registration flow."
      />
      <NewTeamForm orgId={orgId} />
    </div>
  );
}
