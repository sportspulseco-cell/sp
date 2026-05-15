import Link from "next/link";
import { ArrowLeft, Building2, CalendarRange } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { NewDivisionForm } from "./new-division-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "New division — Org admin" };

export default async function NewDivisionPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// New division" title="Create a division" />
        <EmptyState
          icon={Building2}
          title="No org in scope"
          description="Pick an org from the switcher first."
        />
      </div>
    );
  }

  const seasonsPage = await leagueMgmt
    .listSeasons({ orgId })
    .catch(() => ({ items: [], nextCursor: null }));

  if (seasonsPage.items.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/divisions"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          All divisions
        </Link>
        <PageHeader eyebrow="// New division" title="Create a division" />
        <EmptyState
          icon={CalendarRange}
          title="No seasons yet"
          description="Divisions live under a season. Create one first."
        />
        <Link
          href="/seasons/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
        >
          Create a season
        </Link>
      </div>
    );
  }

  const seasons = seasonsPage.items.map((s) => ({
    id: s.id,
    name: s.name,
    sportCode: s.sportCode
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All divisions
      </Link>
      <PageHeader
        eyebrow="// New division"
        title="Create a division"
        description="Pick the season, give the division a name, and optionally cap the number of teams that can enter."
      />
      <NewDivisionForm seasons={seasons} />
    </div>
  );
}
