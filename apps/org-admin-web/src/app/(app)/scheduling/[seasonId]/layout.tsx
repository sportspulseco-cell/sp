import type { ReactNode } from "react";
import { SchedulingTabs } from "@sportspulse/admin-pages";

export default async function OrgAdminSchedulingSeasonLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  return (
    <div className="space-y-6">
      <SchedulingTabs seasonId={seasonId} />
      {children}
    </div>
  );
}
