import { fetchAll } from "@sportspulse/api-client";
import { sportByOrg } from "@sportspulse/admin-pages";
import { admin, leagueMgmt, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { OrgSetupShell } from "./org-setup-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Org setup · Super Admin" };

export default async function OrgSetupPage() {
  // Bootstrap dropdown data once, on the server. Subsequent dependent
  // dropdowns (governing-bodies-by-sport, age-groups-by-body) load
  // from the client as the admin makes selections.
  const [orgsPage, sports, governingBodies, leaguesPage] = await Promise.all([
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null })),
    admin.listSports().catch(() => []),
    leagueMgmt.listGoverningBodies({}).catch(() => []),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
  ]);

  // No early empty state: super admins can create the first organisation
  // from step 1 of the wizard.
  return (
    <OrgSetupShell
      orgs={orgsPage.items}
      sports={sports}
      governingBodies={governingBodies}
      orgSports={sportByOrg(leaguesPage.items)}
    />
  );
}
