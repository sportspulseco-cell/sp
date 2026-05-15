import Link from "next/link";
import { ArrowLeft, Building2, Trophy } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { NewSeasonForm } from "./new-season-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "New season — Org admin" };

export default async function NewSeasonPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// New season" title="Create a season" />
        <EmptyState
          icon={Building2}
          title="No org in scope"
          description="Pick an org from the switcher first."
        />
      </div>
    );
  }

  const leaguesPage = await leagueMgmt
    .listLeagues({ orgId })
    .catch(() => ({ items: [], nextCursor: null }));

  if (leaguesPage.items.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/seasons"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          All seasons
        </Link>
        <PageHeader eyebrow="// New season" title="Create a season" />
        <EmptyState
          icon={Trophy}
          title="No leagues yet"
          description="Seasons live under a league. Create one first."
        />
        <Link
          href="/leagues/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
        >
          Create a league
        </Link>
      </div>
    );
  }

  const leagues = leaguesPage.items.map((l) => ({
    id: l.id,
    name: l.name,
    sportCode: l.sportCode
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/seasons"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All seasons
      </Link>
      <PageHeader
        eyebrow="// New season"
        title="Create a season"
        description="Pick the league, set the date window, and optionally the registration + roster-lock windows. Divisions get added in the super-admin console for now."
      />
      <NewSeasonForm leagues={leagues} />
    </div>
  );
}
