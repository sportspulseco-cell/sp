import { CalendarRange } from "lucide-react";
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
import { CreateSeasonButton } from "@/components/seasons/create-season-button";

export const metadata = { title: "Seasons — SportsPulse" };

export default async function SeasonsPage() {
  const [seasons, orgList] = await Promise.all([
    leagueMgmt.listSeasons().catch(() => ({ items: [] })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [] }))
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seasons"
        description="Time-bounded containers under an organization. Hold leagues."
        action={<CreateSeasonButton orgs={orgList.items} />}
      />

      {seasons.items.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No seasons yet"
          description="Create the first season for any organization on the platform."
          action={<CreateSeasonButton orgs={orgList.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Org</TH>
              <TH>Sport</TH>
              <TH>Window</TH>
              <TH>Timezone</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {seasons.items.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  <Link href={`/leagues?seasonId=${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {orgMap.get(s.orgId) ?? s.orgId.slice(0, 8)}
                </TD>
                <TD className="text-muted-foreground">{s.sportCode}</TD>
                <TD className="text-muted-foreground">
                  {s.startDate} → {s.endDate}
                </TD>
                <TD className="text-muted-foreground">{s.timezone}</TD>
                <TD>
                  <Badge tone={statusTone(s.status)}>
                    {s.status.replace(/_/g, " ")}
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
