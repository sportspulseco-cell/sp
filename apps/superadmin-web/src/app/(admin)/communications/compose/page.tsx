import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { load } from "@sportspulse/api-client";
import { LoadError } from "@sportspulse/ui";
import { orgAdminBroadcast } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ComposeClient } from "./compose-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Send an announcement — SportsPulse" };

const TARGET_TYPES = ["org", "league", "season", "division", "team"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

/**
 * League announcement (UC-19) for super, org and league admins. The
 * server lists only the parts of an org the caller may send to (a league
 * admin: their leagues and below) and checks the same rule on send.
 * `?targetType=team&targetId=...` preselects the target when the page is
 * opened from a league, season, division or team page.
 */
export default async function ComposeAnnouncementPage({
  searchParams
}: {
  searchParams?: Promise<{ orgId?: string; targetType?: string; targetId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const res = await load(orgAdminBroadcast.targets(sp.orgId ? { orgId: sp.orgId } : {}));
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
        Messages
      </Link>
      <PageHeader
        eyebrow="Messages"
        title="Send an announcement"
        description="Send to players, captains, coaches, referees or admins in a league, season, division or team you run."
      />
      {!res.ok ? (
        <LoadError what="the places you can send to" status={res.status} message={res.message} />
      ) : !res.data.reach ? (
        <EmptyState
          icon={Megaphone}
          title="Nothing you can send to"
          description="Announcements are sent by org admins and league admins. Ask your org admin for the league admin role."
        />
      ) : (
        <ComposeClient
          reach={res.data.reach}
          orgs={res.data.orgs}
          initialTarget={initialType ? { type: initialType, id: sp.targetId } : null}
        />
      )}
    </div>
  );
}
