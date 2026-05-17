"use client";

import { SeasonStatusControl } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Season } from "@sportspulse/api-client";

export function ChangeSeasonStatusButton({ season }: { season: Season }) {
  return (
    <SeasonStatusControl
      seasonId={season.id}
      currentStatus={season.status}
      changeStatus={(id, status) => leagueMgmt.changeSeasonStatus(id, status)}
    />
  );
}
