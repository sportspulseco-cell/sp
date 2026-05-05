import { ArrowLeft, CalendarRange } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leagueMgmt } from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";

export const metadata = { title: "Season — SportsPulse" };

export default async function SeasonDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const season = await leagueMgmt.getSeason(id).catch(() => null);
  if (!season) notFound();

  return (
    <div className="space-y-10">
      <Link
        href="/seasons"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All seasons
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={CalendarRange} tint="violet" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>SEASON · {season.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {season.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge mono>{season.sportCode}</Badge>
            <Badge tone={statusTone(season.status)} mono>
              {season.status}
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              {season.startDate} → {season.endDate}
            </span>
          </div>
        </div>

        <Link
          href={`/registrations/seasons/${season.id}/setup`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
        >
          Open registration setup →
        </Link>
      </header>

      <ResourceAdminsSection
        scopeType="season"
        scopeId={season.id}
        resourceLabel={season.name}
        allowedRoleCodes={["season_admin", "registrar"]}
        description="Season admins manage registrations and roster locks for this season."
      />
    </div>
  );
}
