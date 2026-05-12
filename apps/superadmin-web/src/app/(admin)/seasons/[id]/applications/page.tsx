import { adminTransfers } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader
        eyebrow={`// admin · ${initial.season.name}`}
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
              {new Date(initial.season.registrationClosesAt).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric", year: "numeric" }
              )}
            </span>
          ) : undefined
        }
      />
      <ApplicationsQueue seasonId={seasonId} initial={initial} />
    </div>
  );
}
