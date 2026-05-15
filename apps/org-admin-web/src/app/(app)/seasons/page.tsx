import { CalendarRange } from "lucide-react";
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
export const metadata = { title: "Seasons - Org Admin" };

function fmt(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default async function SeasonsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await leagueMgmt.listSeasons({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Seasons"
        title="Seasons"
        description="Seasons across every league in your org. Open the super-admin console to create + manage."
      />
      {page.items.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No seasons yet" description="Create the first season from the super-admin console." />
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
                <TD className="font-medium text-fg">{s.name}</TD>
                <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">{s.sportCode}</TD>
                <TD className="text-[12px] text-fg-muted">
                  {fmt(s.startDate)} - {fmt(s.endDate)}
                </TD>
                <TD>
                  <Badge mono tone={(s.status as string) === "active" || (s.status as string) === "registration_open" ? "success" : "neutral"}>
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
