import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { Division } from "@sportspulse/api-client";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Divisions - Org Admin" };

export default async function DivisionsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  // Divisions are filtered by seasonId; fetch every season in the org
  // and union the divisions. Cheap enough at the org scale we expect.
  const seasonsPage = orgId
    ? await leagueMgmt.listSeasons({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const divisionsLists = await Promise.all(
    seasonsPage.items.map((s) =>
      leagueMgmt.listDivisions({ seasonId: s.id }).catch(() => ({ items: [], nextCursor: null }))
    )
  );
  const all: Division[] = divisionsLists.flatMap((p) => p.items);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Divisions"
        title="Divisions"
        description="Divisions across every season in your org. Add new tiers / age groups here as seasons need them."
        action={
          <Link
            href="/divisions/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New division
          </Link>
        }
      />
      {all.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No divisions yet"
          description="Create a division to start taking team applications."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Tier</TH>
              <TH>Eligibility</TH>
              <TH className="text-right">Max teams</TH>
            </TR>
          </THead>
          <TBody>
            {all.map((d: Division) => (
              <TR key={d.id}>
                <TD className="font-medium text-fg">{d.name}</TD>
                <TD className="text-fg-muted">{d.tier ?? "-"}</TD>
                <TD>
                  <Badge mono tone="neutral">{d.genderEligibility ?? "open"}</Badge>
                </TD>
                <TD className="text-right font-mono tabular-nums text-fg-muted">
                  {d.maxTeams ?? "-"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
