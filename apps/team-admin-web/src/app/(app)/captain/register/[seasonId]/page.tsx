import Link from "next/link";
import { ArrowLeft, ShieldAlert, Sparkles } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <Link
        href="/captain/register"
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      <PageHeader
        eyebrow={`// ${divs.season.name}`}
        title="Choose a division"
        description={
          divs.season.registrationClosesAt
            ? `Registration closes ${new Date(divs.season.registrationClosesAt).toLocaleDateString()}.`
            : undefined
        }
      />

      <DivisionPicker
        teamId={teamId}
        seasonId={seasonId}
        divisions={divs.items}
      />
    </div>
  );
}
