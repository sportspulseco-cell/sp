"use client";

import { UrlFilters } from "@sportspulse/ui";

/**
 * /rosters search + Team / Season / Type / Status filters
 * (?q=&teamId=&seasonId=&type=&status=), the same control as /users and
 * /persons (PPHL, 29 Oct 2026).
 */
export function RosterFilters({
  teams,
  seasons,
  types,
  statuses
}: {
  teams: Array<{ id: string; name: string }>;
  seasons: Array<{ id: string; name: string }>;
  types: string[];
  statuses: Array<{ value: string; label: string }>;
}) {
  return (
    <UrlFilters
      searchPlaceholder="Search by player name"
      selects={[
        { param: "teamId", label: "Team", allLabel: "All teams", options: teams.map((t) => ({ value: t.id, label: t.name })) },
        { param: "seasonId", label: "Season", allLabel: "All seasons", options: seasons.map((s) => ({ value: s.id, label: s.name })) },
        { param: "type", label: "Type", allLabel: "All types", options: types.map((t) => ({ value: t, label: t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) })) },
        { param: "status", label: "Status", allLabel: "All statuses", options: statuses }
      ]}
    />
  );
}
