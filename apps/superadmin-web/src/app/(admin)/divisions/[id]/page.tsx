import { ArrowLeft, Layers } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leagueMgmt } from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";

export const metadata = { title: "Division — SportsPulse" };

export default async function DivisionDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const division = await leagueMgmt.getDivision(id).catch(() => null);
  if (!division) notFound();

  return (
    <div className="space-y-10">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All divisions
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Layers} tint="cyan" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>DIVISION · {division.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {division.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {division.tier && <Badge mono>{division.tier}</Badge>}
            <Badge mono>{division.genderEligibility}</Badge>
            <Badge tone={statusTone(division.status)} mono>
              {division.status}
            </Badge>
          </div>
        </div>
      </header>

      <ResourceAdminsSection
        scopeType="division"
        scopeId={division.id}
        resourceLabel={division.name}
        allowedRoleCodes={["division_admin"]}
        description="Division admins manage teams, lineups, and games inside this division."
      />
    </div>
  );
}
