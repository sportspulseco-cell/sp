import { notFound } from "next/navigation";
import { DivisionDetail } from "@sportspulse/admin-pages";
import { adminTransfers, iam, leagueMgmt } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";

export const metadata = { title: "Division — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Org-admin's read-only division detail. Mirrors sa-web by mounting
 * the same shared component (@sportspulse/admin-pages — DivisionDetail).
 * The sa-only pending-applications card and role-assignments panel
 * stay omitted today; the rest of the body is identical.
 *
 * Reads flow through endpoints that already accept org_admin:
 *   - `/league/divisions/:id` + `/league/seasons/:id` via AuthorizedAccessGuard
 *   - `/admin/divisions/:id/teams` via RolesGuard(org_admin, ...) +
 *     AuthorizedAccessGuard
 */
export default async function OrgAdminDivisionDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const division = await leagueMgmt.getDivision(id).catch(() => null);
  if (!division) notFound();

  const [parentSeason, divisionTeams] = await Promise.all([
    leagueMgmt.getSeason(division.seasonId).catch(() => null),
    adminTransfers.listDivisionTeams(id).catch(() => ({ items: [] }))
  ]);

  // Defense in depth — the API already 404s out-of-scope divisions
  // for org_admin, but verify the parent season's org matches the
  // caller's active org before rendering.
  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);
  if (parentSeason && activeOrgId && parentSeason.orgId !== activeOrgId) {
    notFound();
  }

  return (
    <DivisionDetail
      division={division}
      parentSeason={parentSeason}
      divisionTeams={divisionTeams.items}
    />
  );
}
