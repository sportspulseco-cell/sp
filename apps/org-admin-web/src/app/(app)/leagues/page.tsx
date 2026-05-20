/* Hallmark · page: list (leagues) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { Wand2, Trophy } from "lucide-react";
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
export const metadata = { title: "Leagues - Org Admin" };

export default async function LeaguesPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await leagueMgmt.listLeagues({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const active = page.items.filter((l) => (l.status as string) === "active").length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Leagues"
        title="Leagues"
        description="Every league owned by your org. New leagues, seasons, and divisions are all created through Org setup."
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
          label="Roster"
          subtitle="Each row is a league in your org. Tap a row to manage its seasons, divisions, and teams."
          meta={`${active} active · ${page.items.length} total`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Trophy}
                title="No leagues yet"
                description="Head to Org setup to spin up your first league, season, and divisions in one flow."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Sport</TH>
                  <TH>Format</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {page.items.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Link
                        href={`/leagues/${l.id}`}
                        className="font-medium text-fg hover:text-accent"
                      >
                        {l.name}
                      </Link>
                    </TD>
                    <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">{l.sportCode}</TD>
                    <TD className="text-fg-muted">{l.format ?? "—"}</TD>
                    <TD>
                      <Badge mono tone={(l.status as string) === "active" ? "success" : "neutral"}>
                        {l.status.replace(/_/g, " ")}
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
