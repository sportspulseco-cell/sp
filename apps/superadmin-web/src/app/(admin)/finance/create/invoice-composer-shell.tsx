"use client";

/**
 * Sa-web binding for the shared InvoiceComposer in @sportspulse/admin-pages.
 * Passes every org (sa picks), uses sa-web's browser-api finance SDK,
 * and routes back to sa-web's /finance on success. Mirror of the
 * org-admin-web shell — both apps consume the same component.
 */

import { useRouter } from "next/navigation";
import {
  type InvoiceComposerFeeSchedule,
  InvoiceComposer,
  type InvoiceComposerLeague,
  type InvoiceComposerSeason,
  type InvoiceComposerDivision,
  type InvoiceComposerTeam,
  type InvoiceComposerOrg,
  type InvoiceComposerPerson
} from "@sportspulse/admin-pages";
import { finance } from "@/lib/api/browser-api";
import { navigateInPlace } from "@sportspulse/ui";

export function InvoiceComposerShell({
  orgs,
  leagues,
  seasons,
  divisions,
  teams,
  persons,
  feeSchedules
}: {
  orgs: InvoiceComposerOrg[];
  leagues: InvoiceComposerLeague[];
  seasons: InvoiceComposerSeason[];
  divisions: InvoiceComposerDivision[];
  teams: InvoiceComposerTeam[];
  persons: InvoiceComposerPerson[];
  feeSchedules?: InvoiceComposerFeeSchedule[];
}) {
  const router = useRouter();
  return (
    <InvoiceComposer
      orgs={orgs}
      leagues={leagues}
      seasons={seasons}
      divisions={divisions}
      teams={teams}
      persons={persons}
      feeSchedules={feeSchedules}
      createBulkInvoice={(body, key) => finance.createBulkInvoice(body, key)}
      onSuccess={() => {
        navigateInPlace((h) => router.push(h), "/finance", 8000);
        // No router.refresh() here: it can cancel the push and leave the
        // user on this form (J11). The new page loads fresh server data.
      }}
      onCancel={() => router.back()}
    />
  );
}
