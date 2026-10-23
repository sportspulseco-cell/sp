import { fetchAll } from "@sportspulse/api-client";
import { leagueMgmt, orgAdminPersons, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceComposerShell } from "./invoice-composer-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "New invoice — SportsPulse" };

/**
 * Sa-web entry for the shared @sportspulse/admin-pages InvoiceComposer.
 * Sa picks the org first (full list), then targets cascade. Same shared
 * component org-admin-web mounts — one source of truth for invoice
 * creation across the platform.
 */
export default async function NewInvoicePage() {
  const [orgsPage, leaguesPage, seasonsPage, teamsPage] = await Promise.all([
    // orgs.list caps at @Max(100); 500 throws ValidationError and the
    // catch swallows it to {} — leaving the org picker empty (bug).
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listTeams({ limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  // Divisions fan out across every season — capped by listSeasons's
  // pagination. For sa this is the platform-wide set.
  const divisionsLists = await Promise.all(
    seasonsPage.items.map((s) =>
      leagueMgmt
        .listDivisions({ seasonId: s.id })
        .catch(() => ({ items: [], nextCursor: null }))
    )
  );
  // Individual scope needs each org's people. Same endpoint org-admin-web
  // uses; super_admin passes its scope check.
  const personsLists = await Promise.all(
    orgsPage.items.map((o) =>
      orgAdminPersons.list({ orgId: o.id }).catch(() => [])
    )
  );
  const persons = personsLists.flat().map((p) => ({
    id: p.id,
    orgId: p.orgId,
    displayName: p.email ? `${p.displayName} · ${p.email}` : p.displayName
  }));

  const divisions = divisionsLists.flatMap((p, i) =>
    p.items.map((d) => ({
      id: d.id,
      name: d.name,
      orgId: seasonsPage.items[i]?.orgId ?? ""
    }))
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="finance"
        title="New invoice"
        description="Pick the org, then the billing scope (individual / team / division / league / season / org-wide). Fanout creates one invoice per recipient inside a single transaction."
      />
      <InvoiceComposerShell
        orgs={orgsPage.items.map((o) => ({
          id: o.id,
          displayName: o.displayName
        }))}
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
        divisions={divisions}
        teams={teamsPage.items.map((t) => ({
          id: t.id,
          name: t.name,
          orgId: t.orgId
        }))}
        persons={persons}
      />
    </div>
  );
}
