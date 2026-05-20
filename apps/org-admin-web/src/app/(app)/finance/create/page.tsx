import { Building2 } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, leagueMgmt, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { InvoiceComposerShell } from "./invoice-composer-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "New invoice — Org Admin" };

/**
 * Server entry for the shared @sportspulse/admin-pages InvoiceComposer.
 * Fetches the active-org's leagues/seasons/divisions/teams so the
 * composer's target picker can render cascading options scoped to the
 * org. On success the shell routes back to org-admin's `/finance` page
 * — never sa-web's URL.
 */
export default async function NewInvoicePage() {
  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);
  if (!activeOrgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Finance" title="New invoice" />
        <EmptyState
          icon={Building2}
          title="No organization in scope"
          description="Ask the platform admin to grant you org_admin on at least one org first."
        />
      </div>
    );
  }

  const [orgsPage, leaguesPage, seasonsPage, teamsPage] = await Promise.all([
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt
      .listLeagues({ orgId: activeOrgId })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt
      .listSeasons({ orgId: activeOrgId })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt
      .listTeams({ orgId: activeOrgId })
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  // Divisions are filtered by seasonId; fan out across the org's
  // seasons. Caps at 100 seasons since the listSeasons call already
  // does — anything beyond that is a separate paging concern.
  const divisionsLists = await Promise.all(
    seasonsPage.items.map((s) =>
      leagueMgmt
        .listDivisions({ seasonId: s.id })
        .catch(() => ({ items: [], nextCursor: null }))
    )
  );
  const divisions = divisionsLists.flatMap((p) => p.items);

  const activeOrg =
    orgsPage.items.find((o) => o.id === activeOrgId) ?? null;
  if (!activeOrg) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Finance" title="New invoice" />
        <EmptyState
          icon={Building2}
          title="Active org not visible"
          description="Your active org isn't in the orgs list. Try switching orgs in the header."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Finance"
        title="New invoice"
        description="Bill an individual, a team, a division, a league, a season, or the whole org. Fanout creates one invoice per recipient inside a single transaction."
      />
      <InvoiceComposerShell
        activeOrgId={activeOrg.id}
        activeOrgName={activeOrg.displayName}
        leagues={leaguesPage.items.map((l) => ({
          id: l.id,
          name: l.name,
          orgId: l.orgId
        }))}
        seasons={seasonsPage.items.map((s) => ({
          id: s.id,
          name: s.name,
          orgId: s.orgId
        }))}
        divisions={divisions.map((d) => ({
          id: d.id,
          name: d.name,
          // Divisions don't carry orgId on the row; we resolve via the
          // parent season the listDivisions call was made against. The
          // composer uses orgId only to filter the picker, so picking
          // the season's orgId is correct.
          orgId: activeOrg.id
        }))}
        teams={teamsPage.items.map((t) => ({
          id: t.id,
          name: t.name,
          orgId: t.orgId
        }))}
      />
    </div>
  );
}
