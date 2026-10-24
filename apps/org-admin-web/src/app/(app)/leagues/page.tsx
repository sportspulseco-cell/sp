import { fetchAll } from "@sportspulse/api-client";
/* Hallmark · page: list (leagues) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { Wand2, Trophy } from "lucide-react";
import {
  Alert,
  Badge,
  EmptyState,
  SectionRail,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  UrlFilters
} from "@sportspulse/ui";
import type { League } from "@sportspulse/api-client";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { LeagueActions } from "@/components/edit/detail-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leagues - Org Admin" };

/** Filters live in the URL (?q=&status=&sport=). */
export default async function LeaguesPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; status?: string; sport?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  let loadFailed = false;
  const page = orgId
    ? await fetchAll((cursor) => leagueMgmt.listLeagues({ orgId, limit: 100, cursor })).catch((e) => {
        // Show the failure; an empty list here read as "No leagues yet".
        console.error("[leagues] listLeagues failed", e);
        loadFailed = true;
        return { items: [] as League[], nextCursor: null };
      })
    : { items: [] as League[], nextCursor: null };

  const governingBodies = await leagueMgmt.listGoverningBodies({}).catch(() => []);

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = page.items.filter((l) => {
    if (sp.status && (l.status as string) !== sp.status) return false;
    if (sp.sport && l.sportCode !== sp.sport) return false;
    if (q) {
      const hay = `${l.name} ${l.sportCode} ${l.format ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sportOptions = [...new Set(page.items.map((l) => l.sportCode))]
    .sort()
    .map((s) => ({ value: s, label: s }));

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
        <div className="space-y-2">
          <UrlFilters
            searchPlaceholder="Search leagues by name, sport or format"
            selects={[
              {
                param: "status",
                label: "Status",
                allLabel: "All statuses",
                options: [
                  { value: "draft", label: "Draft" },
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" }
                ]
              },
              { param: "sport", label: "Sport", allLabel: "All sports", options: sportOptions }
            ]}
          />
          <p className="text-[12px] text-fg-muted">
            Showing {shown.length} of {page.items.length} leagues
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {loadFailed ? (
            <div className="p-4">
              <Alert tone="error">
                Could not load leagues. This is a server problem on our side, not your data. Reload to try again.
              </Alert>
            </div>
          ) : page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Trophy}
                title="No leagues yet"
                description="Head to Org setup to spin up your first league, season, and divisions in one flow."
              />
            </div>
          ) : shown.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={Trophy}
                title="No leagues match these filters"
                description="Clear the search or pick a different status or sport."
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
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((l) => (
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
                    <TD>
                      <LeagueActions league={l} governingBodies={governingBodies} />
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
