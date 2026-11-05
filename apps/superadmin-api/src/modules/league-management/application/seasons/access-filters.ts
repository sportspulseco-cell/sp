import type {UserScope} from "../../../../shared/auth/scope";
import {unrestricted} from "../../../../shared/auth/visibility";

/** Undefined filters mean unrestricted. Empty arrays must continue to mean no access. */
export function seasonReadFilters(scope:UserScope) {
  if (unrestricted(scope)) return {};
  return {
    leagueIdsFilter: scope.leagueIds ?? [],
    orgIdsFilter: scope.orgWideOrgIds ?? [],
    seasonIdsFilter: [...(scope.seasonIds ?? []), ...(scope.parentSeasonIds ?? [])]
  };
}
