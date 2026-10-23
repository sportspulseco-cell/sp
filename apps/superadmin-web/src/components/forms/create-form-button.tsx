"use client";
import { fetchAll } from "@sportspulse/api-client";

/**
 * Sa-web binding for the shared CreateFormButton in @sportspulse/admin-pages.
 * Supplies sa-web's browser-api SDK callbacks; routes to sa-web's /forms/[id].
 * Same shared component the org-admin-web app mounts — no parallel UI.
 */

import { useRouter } from "next/navigation";
import { CreateFormButton as SharedCreateFormButton } from "@sportspulse/admin-pages";
import { leagueMgmt, registration } from "@/lib/api/browser-api";
import type { Org } from "@/lib/api/types";

export function CreateFormButton({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  return (
    <SharedCreateFormButton
      orgs={orgs.map((o) => ({ id: o.id, displayName: o.displayName }))}
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
      onCreated={(formId) => {
        router.push(`/forms/${formId}`);
        router.refresh();
      }}
    />
  );
}
