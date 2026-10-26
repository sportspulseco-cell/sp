import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { load } from "@sportspulse/api-client";
import { EmptyState, LoadError, PageHeader } from "@sportspulse/ui";
import { iam, loadMeScope, orgAdminBroadcast } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { ComposeForm } from "./compose-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compose broadcast — Org admin" };

const TARGET_TYPES = ["org", "league", "season", "division", "team"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

export default async function ComposePage({
  searchParams
}: {
  searchParams?: Promise<{ targetType?: string; targetId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Compose" title="Send a broadcast" />
        <EmptyState
          icon={Building2}
          title="No org in scope"
          description="Pick an org from the switcher first."
        />
      </div>
    );
  }

  // The parts of the org this admin may send to, from the same rule the
  // server checks on send (shared with superadmin-web's compose page).
  const res = await load(orgAdminBroadcast.targets({ orgId }));
  const initialType = TARGET_TYPES.includes(sp.targetType as TargetType)
    ? (sp.targetType as TargetType)
    : null;

  return (
    <div className="space-y-6">
      <Link
        href="/communications"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Outbox
      </Link>
      <PageHeader
        eyebrow="Compose"
        title="Send a broadcast"
        description="Send an announcement to people in the whole organisation or in one league, season, division or team."
      />
      {!res.ok || !res.data.reach ? (
        <LoadError
          what="the places you can send to"
          status={res.ok ? 404 : res.status}
          message={res.ok ? "No org you can send to" : res.message}
        />
      ) : (
        <ComposeForm
          reach={res.data.reach}
          initialTarget={initialType ? { type: initialType, id: sp.targetId } : null}
        />
      )}
    </div>
  );
}
