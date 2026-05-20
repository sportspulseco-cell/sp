/* Hallmark · page: list (seasons) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { CalendarRange, Wand2 } from "lucide-react";
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
export const metadata = { title: "Seasons - Org Admin" };

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

const OPEN_STATES = new Set([
  "active",
  "registration_open",
  "in_progress"
]);

export default async function SeasonsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await leagueMgmt.listSeasons({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const open = page.items.filter((s) => OPEN_STATES.has(s.status as string)).length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Seasons"
        title="Seasons"
        description="Seasons across every league in your org. New seasons are created through Org setup alongside their league and divisions."
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
          label="Schedule"
          subtitle="Every season your org is running. Open one to manage divisions, registrations, and game ops."
          meta={`${open} open · ${page.items.length} total`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={CalendarRange}
                title="No seasons yet"
                description="Head to Org setup to spin up your first league, season, and divisions in one flow."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Sport</TH>
                  <TH>Window</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {page.items.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium text-fg">
                      <Link href={`/seasons/${s.id}`} className="hover:text-accent">
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">{s.sportCode}</TD>
                    <TD className="text-[12px] text-fg-muted">
                      {fmt(s.startDate)} — {fmt(s.endDate)}
                    </TD>
                    <TD>
                      <Badge
                        mono
                        tone={OPEN_STATES.has(s.status as string) ? "success" : "neutral"}
                      >
                        {s.status.replace(/_/g, " ")}
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
