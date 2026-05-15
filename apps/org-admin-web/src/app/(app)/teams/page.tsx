import Link from "next/link";
import { Network } from "lucide-react";
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
export const metadata = { title: "Teams - Org Admin" };

export default async function TeamsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await leagueMgmt.listTeams({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Teams"
        title="Teams"
        description="Every team registered under your org."
      />
      {page.items.length === 0 ? (
        <EmptyState icon={Network} title="No teams yet" description="Teams appear once league admins or captains create them." />
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
                  <Link
                    href={`/teams/${t.id}`}
                    className="hover:underline hover:underline-offset-2"
                  >
                    {t.name}
                  </Link>
                </TD>
                <TD className="font-mono text-[11px] text-fg-muted">{t.shortName ?? "-"}</TD>
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
  );
}
