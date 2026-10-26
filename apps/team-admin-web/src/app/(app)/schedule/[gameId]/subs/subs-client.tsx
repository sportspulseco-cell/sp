"use client";

import { CaptainSubsPanel } from "@sportspulse/admin-pages";
import type { CaptainGameSubs } from "@sportspulse/api-client";
import { subs } from "@/lib/api/browser-api";

/** Binds the shared captain subs panel to this app's browser SDK. */
export function SubsClient({ teamId, gameId, initial }: { teamId: string; gameId: string; initial: CaptainGameSubs }) {
  return <CaptainSubsPanel api={subs} teamId={teamId} gameId={gameId} initial={initial} />;
}
