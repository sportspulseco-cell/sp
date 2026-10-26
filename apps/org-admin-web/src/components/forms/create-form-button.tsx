"use client";
import { fetchAll } from "@sportspulse/api-client";

/**
 * Org-admin binding for the shared CreateFormButton in
 * @sportspulse/admin-pages. Org is locked to the caller's active org —
 * an org_admin can only create forms for orgs they manage (the API
 * proxy enforces the same with assertScope).
 *
 * Same shared component sa-web mounts; nothing about the form-builder
 * exposes the sp-superadmin URL.
 */

import { CreateFormButton as SharedCreateFormButton } from "@sportspulse/admin-pages";
import { leagueMgmt, registration } from "@/lib/api/browser-api";

export function CreateFormButton({
  activeOrgId,
  activeOrgName
}: {
  activeOrgId: string;
  activeOrgName: string;
}) {
  return (
    <SharedCreateFormButton
      orgs={[{ id: activeOrgId, displayName: activeOrgName }]}
      lockOrg
      listLeagues={async (orgId) => {
        const page = await fetchAll((cursor) => leagueMgmt.listLeagues({ orgId, limit: 100, cursor }));
        return page.items.map((l) => ({ id: l.id, name: l.name }));
      }}
      listSeasons={async (leagueId) => {
        const page = await fetchAll((cursor) => leagueMgmt.listSeasons({ leagueId, limit: 100, cursor }));
        return page.items.map((s) => ({ id: s.id, name: s.name }));
      }}
      listDivisions={async (seasonId) => {
        const page = await fetchAll((cursor) => leagueMgmt.listDivisions({ seasonId, limit: 100, cursor }));
        return page.items.map((d) => ({ id: d.id, name: d.name }));
      }}
      createForm={(input) => registration.createForm(input)}
      formHref={(formId) => `/forms/${formId}`}
    />
  );
}
