import { Trophy } from "lucide-react";
import Link from "next/link";
import { leagueMgmt, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { CreateLeagueButton } from "@/components/leagues/create-league-button";
import { AssignAdminCell } from "@/components/roles/assign-admin-cell";

export const metadata = { title: "Leagues — SportsPulse" };

/**
 * Post-flip hierarchy: leagues live under an org. Filterable by ?orgId=
 * to scope a list to one organisation. The "Drill into a league" link
 * now goes to /seasons?leagueId= since seasons are children of leagues.
 */
export default async function LeaguesPage({
  searchParams
}: {
  searchParams?: Promise<{ orgId?: string }>;
}) {
  const sp = await searchParams;
  const [leaguesPage, orgList] = await Promise.all([
    leagueMgmt
      .listLeagues({ orgId: sp?.orgId })
      .catch(() => ({ items: [] })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [] }))
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leagues"
        description={
          sp?.orgId
            ? `Filtered by org ${orgMap.get(sp.orgId) ?? sp.orgId.slice(0, 8)}`
            : "Persistent competition containers (e.g. PPHL). Each league has many seasons."
        }
        action={<CreateLeagueButton orgs={orgList.items} />}
      />

      {leaguesPage.items.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues yet"
          description="Leagues are the top-level competition. Create one under any org."
          action={<CreateLeagueButton orgs={orgList.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Org</TH>
              <TH>Sport</TH>
              <TH>Format</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
            </TR>
          </THead>
          <TBody>
            {leaguesPage.items.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">
                  <Link
                    href={`/seasons?leagueId=${l.id}`}
                    className="hover:underline"
                  >
                    {l.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {orgMap.get(l.orgId) ?? l.orgId.slice(0, 8)}
                </TD>
                <TD className="text-muted-foreground">{l.sportCode}</TD>
                <TD className="text-muted-foreground">{l.format}</TD>
                <TD>
                  <Badge tone={statusTone(l.status)}>
                    {l.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="league"
                    scopeId={l.id}
                    resourceLabel={l.name}
                    allowedRoleCodes={[
                      "league_admin",
                      "registrar",
                      "referee",
                      "scorekeeper"
                    ]}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
