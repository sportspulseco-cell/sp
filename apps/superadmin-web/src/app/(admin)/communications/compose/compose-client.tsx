"use client";

import { useRouter } from "next/navigation";
import { AnnouncementComposer, type AnnouncementComposerProps } from "@sportspulse/admin-pages";
import type { AnnouncementReach } from "@sportspulse/api-client";
import { communications, orgAdminBroadcast } from "@/lib/api/browser-api";

export function ComposeClient({
  reach,
  orgs,
  initialTarget
}: {
  reach: AnnouncementReach;
  orgs: Array<{ id: string; name: string }>;
  initialTarget: AnnouncementComposerProps["initialTarget"];
}) {
  const router = useRouter();
  return (
    <AnnouncementComposer
      key={reach.orgId}
      reach={reach}
      orgs={orgs}
      onOrgChange={(orgId) => router.push(`/communications/compose?orgId=${orgId}`)}
      initialTarget={initialTarget}
      send={(body) => orgAdminBroadcast.send(body)}
      uploadAttachment={(b) => orgAdminBroadcast.uploadAttachment(b)}
      removeAttachment={(id) => orgAdminBroadcast.removeAttachment(id)}
      listScheduled={(orgId) => orgAdminBroadcast.scheduled(orgId)}
      cancelScheduled={(id) => orgAdminBroadcast.cancelScheduled(id)}
      loadChannelStatus={() => communications.channelStatus()}
      onSent={() => router.refresh()}
      onCancel={() => router.push("/communications")}
    />
  );
}
