"use client";

import { SeasonStatusControl } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Season } from "@sportspulse/api-client";

/**
 * Org-admin wrapper. Binds the shared dropdown to org-admin's
 * browser-api `leagueMgmt.changeSeasonStatus`. The endpoint
 * (POST /league/seasons/:id/status) lives behind AuthorizedAccessGuard,
 * which accepts org_admin — no proxy needed.
 */
export function ChangeSeasonStatusButton({ season }: { season: Season }) {
  return (
    <SeasonStatusControl
      seasonId={season.id}
      currentStatus={season.status}
      changeStatus={(id, status) => leagueMgmt.changeSeasonStatus(id, status)}
    />
  );
}
