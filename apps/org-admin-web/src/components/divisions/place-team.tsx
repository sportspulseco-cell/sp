"use client";

import { PlaceTeamControl } from "@sportspulse/admin-pages";
import { teamMovement } from "@/lib/api/browser-api";

/** Binds the shared "Add a team" control to this console's API (SCH-4). */
export function PlaceTeam({
  divisionId,
  divisionName,
  teams
}: {
  divisionId: string;
  divisionName: string;
  teams: Array<{ id: string; name: string }>;
}) {
  return (
    <PlaceTeamControl
      divisionName={divisionName}
      teams={teams}
      place={(teamId) => teamMovement.place(teamId, { divisionId })}
    />
  );
}
