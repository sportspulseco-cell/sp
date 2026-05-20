/* Hallmark · page: list (divisions) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { Layers, Wand2 } from "lucide-react";
import {
  Badge,
  EmptyState,
  SectionRail,
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

  // Divisions are filtered by seasonId; fan out across the org's seasons.
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
    <div className="space-y-12">
      <PageHeader
        eyebrow="Divisions"
        title="Divisions"
        description="Divisions across every season in your org. New divisions are created through Org setup alongside their league and season."
        action={
          <Link
            href="/org-setup"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg transition-colors duration-fast ease-ease hover:bg-[var(--accent-hover)]"
          >
            <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
            Open org setup
          </Link>
        }
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Brackets"
          subtitle="Each row groups teams by age, tier, or gender. Open one to see its team applications and eligibility rules."
          meta={`${all.length} total · ${seasonsPage.items.length} seasons`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {all.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Layers}
                title="No divisions yet"
                description="Head to Org setup to set up a league, season, and divisions in one flow."
              />
            </div>
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
                    <TD className="font-medium text-fg">
                      <Link href={`/divisions/${d.id}`} className="hover:text-accent">
                        {d.name}
                      </Link>
                    </TD>
                    <TD className="text-fg-muted">{d.tier ?? "—"}</TD>
                    <TD>
                      <Badge mono tone="neutral">{d.genderEligibility ?? "open"}</Badge>
                    </TD>
                    <TD className="text-right font-mono tabular-nums text-fg-muted">
                      {d.maxTeams ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
