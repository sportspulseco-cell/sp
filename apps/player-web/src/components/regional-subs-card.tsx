"use client";
import type { RegionalSubInbox } from "@sportspulse/kernel";
import { RegionalSubPlayerPanel } from "@sportspulse/admin-pages";
import { subs } from "@/lib/api/browser-api";
export function RegionalSubsCard({ initial }: { initial: RegionalSubInbox | null }) {
  return <RegionalSubPlayerPanel api={subs} initial={initial} />;
}
