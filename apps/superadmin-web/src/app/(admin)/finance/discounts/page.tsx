import { fetchAll } from "@sportspulse/api-client";
import { sortSeasonsByCurrency } from "@sportspulse/kernel";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@sportspulse/ui";
import { DiscountsShell } from "./discounts-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Discounts · Super Admin" };

/**
 * Discount codes and family pricing per season. The shared
 * @sportspulse/admin-pages DiscountsPanel does the work; the API limits
 * every read and write to seasons in the caller's admin scope.
 */
export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season } = await searchParams;
  const seasons = await fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(() => ({
    items: [],
    nextCursor: null
  }));
  // Current and open seasons first, so the page opens on the one being sold now.
  const list = sortSeasonsByCurrency(seasons.items).map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Payments"
        title="Discounts"
        description="Discount codes players type at the payment step, and family pricing: a family maximum and a sibling discount."
      />
      <DiscountsShell seasons={list} initialSeasonId={season ?? list[0]?.id ?? null} />
    </div>
  );
}
