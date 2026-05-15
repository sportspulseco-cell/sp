import { ShoppingBag, UsersRound } from "lucide-react";
import { Badge, EmptyState, Eyebrow } from "@sportspulse/ui";
import { iam, teamStore } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Team store — SportsPulse" };

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

/**
 * Backlog #11 — player view of the team merch catalog. The captain
 * curates the list from team-admin-web `/captain/store`.
 *
 * Purchase flow ships with P4-1 (real Stripe); for now each product
 * shows a disabled "Buy" CTA labelled "Coming soon".
 */
export default async function StorePage() {
  const scope = await iam.meScope().catch(() => null);
  const myTeamId = scope?.teamIds[0] ?? null;

  if (!myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Team store"
          title="Team store"
          description="Merch from your team's captain."
        />
        <EmptyState
          icon={UsersRound}
          title="Not on a roster yet"
          description="Once your captain adds you to the team, you'll see their merch catalog here."
        />
      </div>
    );
  }

  const data = await teamStore
    .listForTeam(myTeamId)
    .catch(() => ({ team: { id: myTeamId, name: "Your team" }, items: [] }));

  if (data.items.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Team store"
          title={`${data.team.name} store`}
          description="Merch from your captain."
        />
        <EmptyState
          icon={ShoppingBag}
          title="Nothing in the store yet"
          description="Your captain hasn't added any merch. Check back later, or nudge them to add some."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Team store"
        title={`${data.team.name} store`}
        description="Merch curated by your captain. Checkout arrives once payments are wired up."
      />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((p) => (
          <article
            key={p.id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-1"
          >
            <div className="relative aspect-square w-full bg-surface-2">
              {p.imageUrl ? (
                // Captain-supplied URL; we don't proxy through Next image-loader.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-fg-muted">
                  <ShoppingBag
                    className="h-10 w-10"
                    strokeWidth={1.25}
                  />
                </div>
              )}
              {p.stockQty != null && p.stockQty <= 0 ? (
                <div className="absolute right-2 top-2">
                  <Badge tone="danger" mono>
                    sold out
                  </Badge>
                </div>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
              <Eyebrow>// {p.variantLabel ?? "product"}</Eyebrow>
              <h3 className="text-sm font-medium text-fg">{p.name}</h3>
              {p.description ? (
                <p className="line-clamp-3 text-xs text-fg-muted">
                  {p.description}
                </p>
              ) : null}
              <div className="mt-auto flex items-center justify-between">
                <span className="font-mono text-sm font-semibold text-fg tabular-nums">
                  {fmt(p.priceCents, p.currency)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  checkout soon
                </span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
