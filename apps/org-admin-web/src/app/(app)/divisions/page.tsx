import { Layers } from "lucide-react";
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

export const dynamic = "force-dynamic";
export const metadata = { title: "Divisions - Org Admin" };

export default async function DivisionsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = scope?.orgIds[0];

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
        description="Divisions across every season in your org."
      />
      {all.length === 0 ? (
        <EmptyState icon={Layers} title="No divisions yet" description="Divisions appear once seasons have them set up." />
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
