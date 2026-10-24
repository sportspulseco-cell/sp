"use client";

import {
  ActionRow,
  EditDivisionButton,
  EditLeagueButton,
  EditOrgButton,
  EditSeasonButton,
  NewDivisionButton,
  NewSeasonButton
} from "@sportspulse/admin-pages";
import type { Division, GoverningBody, League, Org, Season } from "@sportspulse/api-client";
import { leagueMgmt, orgs } from "@/lib/api/browser-api";

/**
 * Binds the shared edit / add-child dialogs (@sportspulse/admin-pages)
 * to this app's browser SDK. The API enforces scope: org admins can only
 * edit records of their own organisation.
 */

export function OrgActions({ org }: { org: Org }) {
  return <EditOrgButton org={org} save={(body) => orgs.update(org.id, body)} />;
}

export function LeagueActions({
  league,
  governingBodies
}: {
  league: League;
  governingBodies: GoverningBody[];
}) {
  return (
    <ActionRow>
      <EditLeagueButton
        league={league}
        governingBodies={governingBodies}
        save={(body) => leagueMgmt.updateLeague(league.id, body)}
      />
      <NewSeasonButton league={league} create={(body) => leagueMgmt.createSeason(body)} />
    </ActionRow>
  );
}

export function SeasonActions({
  season,
  regions
}: {
  season: Season;
  regions: Array<{ id: string; name: string }>;
}) {
  return (
    <ActionRow>
      <EditSeasonButton season={season} save={(body) => leagueMgmt.updateSeason(season.id, body)} />
      <NewDivisionButton season={season} regions={regions} create={(body) => leagueMgmt.createDivision(body)} />
    </ActionRow>
  );
}

export function DivisionActions({
  division,
  regions
}: {
  division: Division;
  regions: Array<{ id: string; name: string }>;
}) {
  return (
    <EditDivisionButton
      division={division}
      regions={regions}
      save={(body) => leagueMgmt.updateDivision(division.id, body)}
    />
  );
}
