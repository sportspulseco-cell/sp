import Link from "next/link";
import { Wand2, Trophy } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Leagues"
        title="Leagues"
        description="Every league owned by your org. New leagues, seasons, and divisions are all created through Org setup."
        action={
          <Link
            href="/org-setup"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
          >
            <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
            Open org setup
          </Link>
        }
      />
      {page.items.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues yet"
          description="Head to Org setup to spin up your first league, season, and divisions in one flow."
        />
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
                <TD className="text-fg-muted">{l.format ?? "-"}</TD>
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
  );
}
