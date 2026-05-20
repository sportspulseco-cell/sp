"use client";

/**
 * Sa-web binding for the shared InvoiceComposer in @sportspulse/admin-pages.
 * Passes every org (sa picks), uses sa-web's browser-api finance SDK,
 * and routes back to sa-web's /finance on success. Mirror of the
 * org-admin-web shell — both apps consume the same component.
 */

import { useRouter } from "next/navigation";
import {
  InvoiceComposer,
  type InvoiceComposerLeague,
  type InvoiceComposerSeason,
  type InvoiceComposerDivision,
  type InvoiceComposerTeam,
  type InvoiceComposerOrg
} from "@sportspulse/admin-pages";
import { finance } from "@/lib/api/browser-api";

export function InvoiceComposerShell({
  orgs,
  leagues,
  seasons,
  divisions,
  teams
}: {
  orgs: InvoiceComposerOrg[];
  leagues: InvoiceComposerLeague[];
  seasons: InvoiceComposerSeason[];
  divisions: InvoiceComposerDivision[];
  teams: InvoiceComposerTeam[];
}) {
  const router = useRouter();
  return (
    <InvoiceComposer
      orgs={orgs}
      leagues={leagues}
      seasons={seasons}
      divisions={divisions}
      teams={teams}
      createBulkInvoice={(body, key) => finance.createBulkInvoice(body, key)}
      onSuccess={() => {
        router.push("/finance");
        router.refresh();
      }}
      onCancel={() => router.back()}
    />
  );
}
