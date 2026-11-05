"""Scheduling regressions use the real CP-SAT engine, not a mock solution."""
import unittest
from main import SolveRequest, Blackout, solve


def request(team_count=2, slot_count=4, **changes):
    data = dict(
        seasonId="season", teams=[dict(teamId=str(i), divisionId="division") for i in range(team_count)],
        slots=[dict(slotId=str(j), surfaceId="ice", venueId="rink", startTsUtc=f"2026-11-{2+j:02}T20:00:00Z",
                    durationMin=60, band="early" if j % 2 == 0 else "late", hourlyCostCents=0,
                    isPlayoffReservation=False) for j in range(slot_count)],
        lockedFixtures=[], gamesPerPair=1, bandDefinitions=[],
        weights=dict(timeSlotFairness=1, homeAwayBalance=1, gapBalance=1), timeLimitSeconds=5, seed="regression",
    )
    data.update(changes)
    return SolveRequest(**data)


class SchedulingRules(unittest.TestCase):
    def test_blackout_rejects_a_forbidden_interval(self):
        req = request(slot_count=2)
        req.teams[0].blackouts = [Blackout(startTsUtc="2026-11-02T19:30:00Z", endTsUtc="2026-11-02T20:30:00Z")]
        result = solve(req)
        self.assertEqual(result.assignments[0].slotId, "1")

    def test_late_limit_zero_is_respected(self):
        result = solve(request(maxLateFraction=0))
        self.assertEqual(result.assignments[0].slotId in ["0", "2"], True)

    def test_impossible_late_limit_reports_infeasible(self):
        req = request(maxLateFraction=0)
        for slot in req.slots:
            slot.band = "late"
        self.assertEqual(solve(req).status, "INFEASIBLE")

    def test_overlapping_inventory_on_same_rink_cannot_double_book(self):
        req = request(team_count=4, slot_count=6)
        for slot in req.slots:
            slot.startTsUtc = "2026-11-02T20:00:00Z"
        self.assertEqual(solve(req).status, "INFEASIBLE")

    def test_weekly_limit_is_hard(self):
        self.assertEqual(solve(request(team_count=3, slot_count=4, maxGamesPerTeamPerWeek=1)).status, "INFEASIBLE")

    def test_off_night_budget_in_local_timezone(self):
        req = request(timezone="America/New_York")
        req.teams[0].preferredWeekdays = [2]  # Tuesday, Nov 3
        req.teams[0].maxOffNightGames = 0
        self.assertEqual(solve(req).assignments[0].slotId, "1")

    def test_preferred_rink_with_no_exceptions(self):
        req = request()
        req.slots[2].venueId = "preferred"
        req.teams[0].preferredVenueIds = ["preferred"]
        req.teams[0].maxOffVenueGames = 0
        self.assertEqual(solve(req).assignments[0].slotId, "2")

    def test_missing_lock_never_silently_disappears(self):
        req = request(lockedFixtures=[dict(homeTeamId="0", awayTeamId="1", slotId="missing")])
        self.assertEqual(solve(req).status, "INFEASIBLE")

    def test_repeated_pair_locks_pin_distinct_fixtures(self):
        req = request(gamesPerPair=2, lockedFixtures=[dict(homeTeamId="0", awayTeamId="1", slotId="0"), dict(homeTeamId="1", awayTeamId="0", slotId="1")])
        result = solve(req)
        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual({(a.slotId, a.homeTeamId) for a in result.assignments}, {("0", "0"), ("1", "1")})

    def test_home_away_balances_and_objective_is_real(self):
        result = solve(request(team_count=3))
        self.assertEqual(result.objectiveBreakdown.homeAwayImbalance, 0)
        self.assertGreater(result.objectiveValue, 0)

    def test_same_seed_same_solution(self):
        req = request(team_count=3)
        self.assertEqual([a.model_dump() for a in solve(req).assignments], [a.model_dump() for a in solve(req).assignments])


if __name__ == "__main__":
    unittest.main()
