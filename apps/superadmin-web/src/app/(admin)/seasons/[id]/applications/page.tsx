import { LocalDate } from "@sportspulse/ui";
import { adminTransfers } from "@/lib/api/server-api";
import { CrumbName, PageHeader } from "@sportspulse/ui";
import { ApplicationsQueue } from "./applications-queue";

export const dynamic = "force-dynamic";

export default async function SeasonApplicationsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: seasonId } = await params;
  const initial = await adminTransfers
    .listApplications(seasonId, "pending")
    .catch(() => ({
      season: { id: seasonId, name: "Season", registrationClosesAt: null },
      divisions: [],
      items: []
    }));

  const divisionListLabel =
    initial.divisions.length === 0
      ? ""
      : initial.divisions.map((d) => d.name).join(", ");

  return (
    <div className="space-y-6">
      <CrumbName id={seasonId} name={initial.season.name} />
      <PageHeader
        eyebrow={`${initial.season.name}`}
        title="Team applications"
        description={
          divisionListLabel
            ? `${initial.season.name} · ${divisionListLabel} divisions`
            : `${initial.season.name} · approve or deny captain-submitted applications.`
        }
        action={
          initial.season.registrationClosesAt ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              Registration closes{" "}
              <LocalDate iso={initial.season.registrationClosesAt} format="date" />
            </span>
          ) : undefined
        }
      />
      <ApplicationsQueue seasonId={seasonId} initial={initial} />
    </div>
  );
}
