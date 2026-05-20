/* Hallmark · page: list (teams) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { Network, Plus } from "lucide-react";
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
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams - Org Admin" };

export default async function TeamsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await leagueMgmt.listTeams({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const active = page.items.filter((t) => (t.status as string) === "active").length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Teams"
        title="Teams"
        description="Every team registered under your org. You can add teams directly or let captains create them through the registration funnel."
        action={
          <Link
            href="/teams/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg transition-colors duration-fast ease-ease hover:bg-[var(--accent-hover)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New team
          </Link>
        }
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Roster"
          subtitle="Each team is owned by a captain and entered into a division per season. Open one to manage roster, lineups, and dues."
          meta={`${active} active · ${page.items.length} total`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Network}
                title="No teams yet"
                description="Add a team here, or wait for captains to apply via the registration funnel."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Short</TH>
                  <TH>Sport</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {page.items.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium text-fg">
                      <Link href={`/teams/${t.id}`} className="hover:text-accent">
                        {t.name}
                      </Link>
                    </TD>
                    <TD className="font-mono text-[11px] text-fg-muted">{t.shortName ?? "—"}</TD>
                    <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">{t.sportCode}</TD>
                    <TD>
                      <Badge mono tone={(t.status as string) === "active" ? "success" : "neutral"}>
                        {t.status}
                      </Badge>
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
