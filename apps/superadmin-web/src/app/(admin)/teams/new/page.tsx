import { notFound } from "next/navigation";
import { admin, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { NewTeamForm } from "./new-team-form";

export const metadata = { title: "New team — SportsPulse" };
export const dynamic = "force-dynamic";

/**
 * Workflow 7A Phase 1 · Team creation
 *
 * Single-page form (no multi-step wizard). The captain rollover wizard
 * is the multi-step UX — admin team creation is a one-shot record.
 *
 * URL form: /teams/new?orgId={id}. The `orgId` query param pre-selects
 * the organisation so deep-links from /organizations/[id] work.
 */
export default async function NewTeamPage({
  searchParams
}: {
  searchParams?: Promise<{ orgId?: string }>;
}) {
  const sp = await searchParams;
  const [orgsPage, sports] = await Promise.all([
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null })),
    admin.listSports().catch(() => [])
  ]);

  if (orgsPage.items.length === 0) {
    notFound();
  }

  const preselectedOrg = sp?.orgId
    ? orgsPage.items.find((o) => o.id === sp.orgId) ?? orgsPage.items[0]!
    : orgsPage.items[0]!;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="lifecycle"
        title="Create team"
        description="A team is the persistent, org-level record. It joins divisions each season via separate registration. Set the captain here so they can run the seasonal rollover."
      />
      <NewTeamForm
        orgs={orgsPage.items}
        sports={sports}
        defaultOrgId={preselectedOrg.id}
      />
    </div>
  );
}
