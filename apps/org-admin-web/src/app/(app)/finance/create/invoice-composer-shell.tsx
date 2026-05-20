"use client";

/**
 * Org-admin binding for the shared InvoiceComposer in
 * @sportspulse/admin-pages. Locked to the active org (one-entry orgs
 * array, no picker). On success routes back to `/finance` — never to
 * sa-web's URL.
 */

import { useRouter } from "next/navigation";
import {
  InvoiceComposer,
  type InvoiceComposerLeague,
  type InvoiceComposerSeason,
  type InvoiceComposerDivision,
  type InvoiceComposerTeam,
  type InvoiceComposerPerson
} from "@sportspulse/admin-pages";
import { orgAdminFinance } from "@/lib/api/browser-api";

export function InvoiceComposerShell({
  activeOrgId,
  activeOrgName,
  leagues,
  seasons,
  divisions,
  teams,
  persons
}: {
  activeOrgId: string;
  activeOrgName: string;
  leagues: InvoiceComposerLeague[];
  seasons: InvoiceComposerSeason[];
  divisions: InvoiceComposerDivision[];
  teams: InvoiceComposerTeam[];
  persons: InvoiceComposerPerson[];
}) {
  const router = useRouter();
  return (
    <InvoiceComposer
      orgs={[{ id: activeOrgId, displayName: activeOrgName }]}
      leagues={leagues}
      seasons={seasons}
      divisions={divisions}
      teams={teams}
      persons={persons}
      createBulkInvoice={(body, key) =>
        orgAdminFinance.createBulkInvoice(body, key)
      }
      onSuccess={() => {
        router.push("/finance");
        router.refresh();
      }}
      onCancel={() => router.back()}
    />
  );
}
