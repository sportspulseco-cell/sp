/**
 * Time-slot fairness accounting (pain #8).
 *
 * Pure functions that turn per-team band counts into a fairness report:
 * each team's early/mid/late proportions, deviation from the league
 * average, and whether the configured tolerance / late-cap is met.
 *
 * Used two ways: as the v1 post-pass metric, and to render the per-team
 * fairness report regardless of which engine produced the schedule. The
 * engine optimises; this explains.
 */
import { TIME_BANDS, type TimeBand } from "./constraints";

export type BandCounts = Record<TimeBand, number>;

export interface TeamFairness {
  teamId: string;
  counts: BandCounts;
  total: number;
  /** Proportion of this team's games in each band. */
  proportions: Record<TimeBand, number>;
  /** Max abs deviation of this team's proportions from the league average. */
  maxDeviation: number;
  lateFraction: number;
  /** True when this team breaches the late cap or tolerance. */
  exceedsTolerance: boolean;
}

export interface FairnessReport {
  teams: TeamFairness[];
  /** League-average proportion per band. */
  leagueAverage: Record<TimeBand, number>;
  /** The single worst team deviation across the league. */
  maxDeviation: number;
  toleranceMet: boolean;
}

function emptyBands(): BandCounts {
  return { early: 0, mid: 0, late: 0 };
}

/**
 * Build the fairness report.
 *
 * @param perTeamCounts team → band → count (from SolveResponse)
 * @param tolerance     max allowed deviation in proportion between a team
 *                      and the league average (0..1)
 * @param maxLateFraction optional hard cap on a team's late-game share
 */
export function computeFairness(
  perTeamCounts: Record<string, Partial<BandCounts>>,
  tolerance: number,
  maxLateFraction?: number
): FairnessReport {
  const teamIds = Object.keys(perTeamCounts);

  // League-average proportions, weighted equally per team (each team's own
  // distribution averaged) — this is what "every team within tolerance of
  // every other" reduces to in practice.
  const leagueTotals = emptyBands();
  let grandTotal = 0;
  for (const teamId of teamIds) {
    for (const band of TIME_BANDS) {
      const c = perTeamCounts[teamId]?.[band] ?? 0;
      leagueTotals[band] += c;
      grandTotal += c;
    }
  }
  const leagueAverage: Record<TimeBand, number> = emptyBands();
  for (const band of TIME_BANDS) {
    leagueAverage[band] = grandTotal > 0 ? leagueTotals[band] / grandTotal : 0;
  }

  let worst = 0;
  const teams: TeamFairness[] = teamIds.map((teamId) => {
    const counts: BandCounts = emptyBands();
    for (const band of TIME_BANDS) {
      counts[band] = perTeamCounts[teamId]?.[band] ?? 0;
    }
    const total = TIME_BANDS.reduce((s, b) => s + counts[b], 0);

    const proportions: Record<TimeBand, number> = emptyBands();
    let maxDeviation = 0;
    for (const band of TIME_BANDS) {
      proportions[band] = total > 0 ? counts[band] / total : 0;
      maxDeviation = Math.max(
        maxDeviation,
        Math.abs(proportions[band] - leagueAverage[band])
      );
    }
    worst = Math.max(worst, maxDeviation);

    const lateFraction = proportions.late;
    const exceedsTolerance =
      maxDeviation > tolerance ||
      (maxLateFraction !== undefined && lateFraction > maxLateFraction);

    return {
      teamId,
      counts,
      total,
      proportions,
      maxDeviation,
      lateFraction,
      exceedsTolerance
    };
  });

  return {
    teams,
    leagueAverage,
    maxDeviation: worst,
    toleranceMet: teams.every((t) => !t.exceedsTolerance)
  };
}
