import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
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
        description="Every league owned by your org. Add a league here; seasons + divisions still happen in the super-admin console for now."
        action={
          <Link
            href="/leagues/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New league
          </Link>
        }
      />
      {page.items.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues yet"
          description="Create your first league to start setting up the season."
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
                <TD className="font-medium text-fg">{l.name}</TD>
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
