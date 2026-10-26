"use client";

import { GameSubsAdminPanel } from "@sportspulse/admin-pages";
import { subs } from "@/lib/api/browser-api";

/** UC-31: guests, sub requests and admin sub assignment on the game page. */
export function GameSubs({ gameId }: { gameId: string }) {
  return <GameSubsAdminPanel api={subs} gameId={gameId} />;
}
