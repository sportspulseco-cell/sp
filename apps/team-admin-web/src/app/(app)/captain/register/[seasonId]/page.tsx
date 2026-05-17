import Link from "next/link";
import { CalendarRange, ChevronRight, ShieldAlert, Sparkles, Users } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { captain, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { DivisionPicker } from "./division-picker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CaptainSeasonDetailPage({
  params
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const teamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !teamId) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Captain role required"
        description="Only the team's captain can register the team."
      />
    );
  }

  const divs = await captain.listDivisions(seasonId).catch(() => null);
  if (!divs) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Season not found"
        description="The season has closed or doesn't exist."
      />
    );
  }

  const { season } = divs;
  const range = formatSeasonRange(season.startDate, season.endDate);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
        <Link href="/captain/register" className="hover:text-fg">
          Register your team
        </Link>
        <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
        <span className="text-fg">{season.name}</span>
      </nav>

      <PageHeader
        title={season.name}
        description="Select a division to apply for. Your application will be reviewed by the league admin before your team is listed."
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-surface-1 px-4 py-3 text-[12px] text-fg-muted">
        {range && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
            Season: <span className="font-medium text-fg">{range}</span>
          </span>
        )}
        {season.registrationClosesAt && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
            Registration closes:{" "}
            <span className="font-medium text-fg">
              {formatDate(season.registrationClosesAt)}
            </span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="font-medium text-fg">{season.teamsRegistered}</span> teams registered so far
        </span>
      </div>

      <DivisionPicker
        teamId={teamId}
        seasonId={seasonId}
        divisions={divs.items}
      />
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatSeasonRange(startISO: string | null, endISO: string | null) {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameYear = start.getFullYear() === end.getFullYear();
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtLong = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  return sameYear
    ? `${fmtShort(start)} – ${fmtLong(end)}`
    : `${fmtLong(start)} – ${fmtLong(end)}`;
}
