import type { TeamInput } from "./contracts";

export interface FinalScheduledGame {
  homeTeamId: string; awayTeamId: string; startTsUtc: string; durationMin: number;
  band: string | null; venueId: string | null;
}

/** Check the actual schedule after retained fixtures and post-processing. */
export function finalTeamConstraintViolations(
  games: FinalScheduledGame[], teams: TeamInput[], timezone: string, maxLateFraction?: number,
): Array<{ type: string; teamId: string; description: string }> {
  const violations: Array<{ type: string; teamId: string; description: string }> = [];
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const team of teams) {
    const own = games.filter(g => g.homeTeamId === team.teamId || g.awayTeamId === team.teamId);
    const report = (type: string, description: string) => violations.push({ type, teamId: team.teamId, description });
    if (maxLateFraction !== undefined && own.length) {
      if (own.some(g => !g.band)) report("unknown_time_band", "A retained game has no time band. Classify it before enforcing a late-game cap.");
      else if (own.filter(g => g.band === "late").length / own.length > maxLateFraction + 1e-9)
        report("late_cap", "The final schedule, including retained games, exceeds the late-game cap.");
    }
    if (own.some(g => team.blackouts?.some(b => Date.parse(g.startTsUtc) < Date.parse(b.endTsUtc) &&
      Date.parse(g.startTsUtc) + g.durationMin * 60000 > Date.parse(b.startTsUtc))))
      report("team_blackout", "A final game overlaps the team's unavailable time.");
    if (team.preferredWeekdays?.length && team.maxOffNightGames !== undefined) {
      const off = own.filter(g => !team.preferredWeekdays!.includes(weekdays.indexOf(formatter.format(new Date(g.startTsUtc))) + 1)).length;
      if (off > team.maxOffNightGames) report("off_night_cap", "The final schedule exceeds the allowed off-night games.");
    }
    if (team.preferredVenueIds?.length && team.maxOffVenueGames !== undefined) {
      const off = own.filter(g => !g.venueId || !team.preferredVenueIds!.includes(g.venueId)).length;
      if (off > team.maxOffVenueGames) report("off_venue_cap", "The final schedule exceeds the allowed games away from the preferred venue (including unknown venues).");
    }
  }
  return violations;
}
