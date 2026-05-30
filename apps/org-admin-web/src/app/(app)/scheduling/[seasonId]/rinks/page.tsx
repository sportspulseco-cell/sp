import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingRinkNotifications } from "@sportspulse/admin-pages";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Rink notifications — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrgAdminRinksPage({
  params
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
  if (!season) notFound();

  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);
  if (activeOrgId && season.orgId !== activeOrgId) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Rinks · ${season.name}`}
        description="Per-venue notification endpoints + delivery outbox."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingRinkNotifications seasonId={season.id} />
    </div>
  );
}
