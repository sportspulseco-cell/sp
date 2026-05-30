/**
 * Time-slot fairness — pure computation.
 *
 * ====================================================================
 *  CANONICAL SOURCE: packages/scheduler-core/src/fairness.ts
 *  This is a Deno-runtime mirror. Update both files in the same PR.
 * ====================================================================
 */

export const TIME_BANDS = ["early", "mid", "late"] as const;
export type TimeBand = (typeof TIME_BANDS)[number];

export type BandCounts = Record<TimeBand, number>;

export interface TeamFairness {
  teamId: string;
  counts: BandCounts;
  total: number;
  proportions: Record<TimeBand, number>;
  maxDeviation: number;
  lateFraction: number;
  exceedsTolerance: boolean;
}

export interface FairnessReport {
  teams: TeamFairness[];
  leagueAverage: Record<TimeBand, number>;
  maxDeviation: number;
  toleranceMet: boolean;
}

function emptyBands(): BandCounts {
  return { early: 0, mid: 0, late: 0 };
}

export function computeFairness(
  perTeamCounts: Record<string, Partial<BandCounts>>,
  tolerance: number,
  maxLateFraction?: number,
): FairnessReport {
  const teamIds = Object.keys(perTeamCounts);
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
        Math.abs(proportions[band] - leagueAverage[band]),
      );
    }
    worst = Math.max(worst, maxDeviation);
    const lateFraction = proportions.late;
    const exceedsTolerance = maxDeviation > tolerance ||
      (maxLateFraction !== undefined && lateFraction > maxLateFraction);
    return {
      teamId, counts, total, proportions, maxDeviation, lateFraction, exceedsTolerance,
    };
  });

  return {
    teams, leagueAverage, maxDeviation: worst,
    toleranceMet: teams.every((t) => !t.exceedsTolerance),
  };
}
