"use client";

import { useRouter } from "next/navigation";
import { AnnouncementComposer, type AnnouncementComposerProps } from "@sportspulse/admin-pages";
import type { AnnouncementReach } from "@sportspulse/api-client";
import { orgAdminBroadcast } from "@/lib/api/browser-api";

/**
 * League announcement (UC-19): the shared composer from
 * @sportspulse/admin-pages (same one superadmin-web mounts), bound to
 * this app's browser SDK.
 */
export function ComposeForm({
  reach,
  initialTarget
}: {
  reach: AnnouncementReach;
  initialTarget: AnnouncementComposerProps["initialTarget"];
}) {
  const router = useRouter();
  return (
    <AnnouncementComposer
      reach={reach}
      initialTarget={initialTarget}
      send={(body) => orgAdminBroadcast.send(body)}
      onSent={() => router.refresh()}
      onCancel={() => router.back()}
    />
  );
}
