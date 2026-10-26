"use client";

/**
 * Sa-web binding for the shared DiscountsPanel in @sportspulse/admin-pages.
 * Mirror of the org-admin-web shell; both apps mount the same component.
 */

import { useMemo } from "react";
import { DiscountsPanel, type DiscountsApi } from "@sportspulse/admin-pages";
import { fetchAll } from "@sportspulse/api-client";
import { leagueMgmt, registrationV2 } from "@/lib/api/browser-api";

export function DiscountsShell({
  seasons,
  initialSeasonId
}: {
  seasons: Array<{ id: string; name: string }>;
  initialSeasonId: string | null;
}) {
  const api = useMemo<DiscountsApi>(
    () => ({
      listCodes: (seasonId) => registrationV2.listDiscountCodes(seasonId),
      createCode: (body) => registrationV2.createDiscountCode(body),
      updateCode: (id, body) => registrationV2.updateDiscountCode(id, body),
      uses: (id) => registrationV2.discountCodeUses(id),
      getFamily: (seasonId) => registrationV2.getFamilyPricing(seasonId),
      putFamily: (body) => registrationV2.putFamilyPricing(body),
      listDivisions: async (seasonId) =>
        (await fetchAll((cursor) => leagueMgmt.listDivisions({ seasonId, limit: 100, cursor }))).items.map((d) => ({
          id: d.id,
          name: d.name
        })),
      listPrices: async (seasonId) =>
        (await registrationV2.listPricingTiers({ seasonId })).map((t) => ({
          id: t.id,
          name: t.name,
          fullPriceCents: t.fullPriceCents,
          currency: t.currency
        }))
    }),
    []
  );
  return <DiscountsPanel seasons={seasons} initialSeasonId={initialSeasonId} api={api} />;
}
