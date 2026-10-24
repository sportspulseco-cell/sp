import { SeasonFlow as SharedSeasonFlow } from "@sportspulse/admin-pages";
import type { League, Registration, Season } from "@/lib/api/types";
import { adminTransfers, gameOps, leagueMgmt, registration, roster } from "@/lib/api/server-api";

/** Admin-console binding of the shared season lifecycle home (see packages/admin-pages/src/season-flow.tsx). */
export function SeasonFlow({
  seasons,
  leagues,
  registrations
}: {
  seasons: Season[];
  leagues: League[];
  registrations: Registration[];
}) {
  return (
    <SharedSeasonFlow
      api={{ leagueMgmt, adminTransfers, gameOps, registration, roster }}
      seasons={seasons}
      leagues={leagues}
      registrations={registrations}
    />
  );
}
