import { fetchAll } from "@sportspulse/api-client";
import { sortSeasonsByCurrency } from "@sportspulse/kernel";
import { Building2 } from "lucide-react";
import { EmptyState, PageHeader } from "@sportspulse/ui";
import { leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { DiscountsShell } from "./discounts-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Discounts — Org Admin" };

/**
 * Discount codes and family pricing for the active org's seasons. Same
 * shared DiscountsPanel as superadmin-web; the API checks every season
 * against the caller's admin scope.
 */
export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season } = await searchParams;
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);
  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Finance" title="Discounts" />
        <EmptyState
          icon={Building2}
          title="No organization in scope"
          description="Ask the platform admin to grant you org_admin on at least one org first."
        />
      </div>
    );
  }
  const seasons = await fetchAll((cursor) => leagueMgmt.listSeasons({ orgId, limit: 100, cursor })).catch(() => ({
    items: [],
    nextCursor: null
  }));
  // Current and open seasons first, so the page opens on the one being sold now.
  const list = sortSeasonsByCurrency(seasons.items).map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finance"
        title="Discounts"
        description="Discount codes players type at the payment step, and family pricing: a family maximum and a sibling discount."
      />
      <DiscountsShell seasons={list} initialSeasonId={season ?? list[0]?.id ?? null} />
    </div>
  );
}
