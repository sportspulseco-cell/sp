import { Layers } from "lucide-react";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

export const metadata = { title: "Divisions — League Admin" };

export default async function DivisionsPage() {
  const page = await leagueMgmt
    .listDivisions({})
    .catch(() => ({ items: [], nextCursor: null }));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="LEAGUE" title="Divisions" />
      {page.items.length === 0 ? (
        <EmptyState icon={Layers} title="No divisions" description="None visible." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Tier</TH>
              <TH>Eligibility</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((d) => (
              <TR key={d.id}>
                <TD className="font-medium text-fg">{d.name}</TD>
                <TD className="text-fg-muted">{d.tier ?? "—"}</TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {d.genderEligibility}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
