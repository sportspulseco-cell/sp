"use client";
import { useMemo } from "react";
import type { RegionalSubInbox } from "@sportspulse/kernel";
import { RegionalSubPlayerPanel } from "@sportspulse/admin-pages";
import { subs } from "@/lib/api/browser-api";
export function RegionalSubsCard({ initial, confirmedOnly = false }: { initial: RegionalSubInbox | null; confirmedOnly?: boolean }) {
  const api = useMemo(() => confirmedOnly ? { ...subs, regionalMine: subs.regionalConfirmed } : subs, [confirmedOnly]);
  return <RegionalSubPlayerPanel api={api} initial={initial} confirmedOnly={confirmedOnly} />;
}
