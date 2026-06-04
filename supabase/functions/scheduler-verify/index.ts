/**
 * scheduler-verify â€” POST endpoint.
 *
 * Pain #5 â€” formally verify the tiebreaker ruleset against the real
 * standings for a season/division, and surface any teams that ended up
 * disambiguated only by the stable-teamId fallback (i.e. the ruleset
 * has nothing left to say about them).
 *
 * This is the deterministic verifier â€” it runs the canonical
 * `rankStandings` (mirrored from scheduler-core) against real data and
 * reports residual ambiguities concretely.
 *
 * NEXT ITERATION â€” Z3 abstract counter-example proof:
 *   import { init } from "npm:z3-solver";
 *   For a ruleset with no H2H, model two teams' metrics as Int vars,
 *   assert metric equality for each rule's tracked metric, and ask
 *   `check()`. Skipped for v1 because the naive model is trivially-SAT
 *   at zero and requires "realistic team data" constraints to be
 *   useful â€” that scaffolding belongs in its own focused turn.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";
import {
  rankStandings,
  type H2HProvider,
  type RankedTeam,
  type TeamStanding,
  type TiebreakerRule,
} from "../_shared/tiebreaker.ts";

const RULE_WHITELIST: ReadonlySet<TiebreakerRule> = new Set([
  "head_to_head", "wins", "goal_diff", "away_goals",
  "home_goals", "goals_for", "goals_against",
]);

interface VerifyBody {
  seasonId: string;
  divisionId?: string;
  /** Ordered ruleset; applied after the primary `points` sort. */
  ruleset: TiebreakerRule[];
}

interface AmbiguousGroup {
  teamIds: string[];
  teamNames: string[];
  startingRank: number;
}

type RankedTeamWithName = RankedTeam & { teamName: string };

interface VerifyResponse {
  seasonId: string;
  divisionId: string | null;
  ruleset: TiebreakerRule[];
  staticWarnings: string[];
  teamCount: number;
  ranked: RankedTeamWithName[];
  /** Groups where the ruleset failed and the stable teamId fallback resolved them. */
  ambiguities: AmbiguousGroup[];
  /** True if no team was resolved by the teamId fallback. */
  rulesetSufficient: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function staticAudit(ruleset: TiebreakerRule[]): string[] {
  const warnings: string[] = [];
  if (ruleset.length === 0) {
    warnings.push("Ruleset is empty â€” primary-tied teams will always fall to teamId order.");
    return warnings;
  }
  const onlyHeadToHead = ruleset.length === 1 && ruleset[0] === "head_to_head";
  if (onlyHeadToHead) {
    warnings.push("Only head_to_head â€” 3-way circular ties will fall to teamId (pain #5).");
  }
  if (!ruleset.includes("goal_diff") && !ruleset.includes("goals_for")) {
    warnings.push("No goal-based rule â€” many ties of equal wins will remain unresolved.");
  }
  return warnings;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.seasonId || !Array.isArray(body.ruleset)) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "ruleset"] }, 400);
  }
  for (const r of body.ruleset) {
    if (!RULE_WHITELIST.has(r)) {
      return json({ error: "unknown_rule", rule: r, allowed: [...RULE_WHITELIST] }, 400);
    }
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;
  if (!userId) return forbidden("unauthenticated");

  const { data: season, error: seasonErr } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (seasonErr || !season) {
    return json({ error: "season_not_found", seasonId: body.seasonId }, 404);
  }

  const allowed = await userHasPermission(sb, userId, "scheduler.verify", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.verify permission required");

  // Load standings for the scope.
  let sq = sb
    .from("standings")
    .select("team_id, gp, w, l, t, otl, points, gf, ga, gd, tiebreakers")
    .eq("league_id", season.league_id);
  if (body.divisionId) sq = sq.eq("division_id", body.divisionId);
  const { data: rows, error: standingsErr } = await sq;
  if (standingsErr) return json({ error: "load_standings_failed", detail: standingsErr.message }, 500);

  const standings: TeamStanding[] = (rows ?? []).map((r) => {
    // away/home goals live in the tiebreakers jsonb â€” pull them out if present.
    // deno-lint-ignore no-explicit-any
    const tb = (r as any).tiebreakers ?? {};
    return {
      teamId: r.team_id as string,
      points: Number(r.points ?? 0),
      wins: Number(r.w ?? 0),
      goalDiff: Number(r.gd ?? 0),
      goalsFor: Number(r.gf ?? 0),
      goalsAgainst: Number(r.ga ?? 0),
      awayGoals: Number(tb.away_goals ?? 0),
      homeGoals: Number(tb.home_goals ?? 0),
    };
  });

  // H2H provider â€” currently unsupported; tells the resolver to skip rule.
  // Wire when packages/db has the per-group H2H aggregation view.
  const h2h: H2HProvider | undefined = undefined;

  const ranked = rankStandings(standings, { ruleset: body.ruleset, h2h });

  // Hydrate team names server-side so the UI doesn't need to re-join.
  const teamIds = [...new Set(standings.map((s) => s.teamId))];
  const teamNameById = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await sb
      .from("teams")
      .select("id, name")
      .in("id", teamIds);
    for (const t of teams ?? []) {
      teamNameById.set(t.id as string, t.name as string);
    }
  }
  const rankedWithNames: RankedTeamWithName[] = ranked.map((r) => ({
    ...r,
    teamName: teamNameById.get(r.teamId) ?? r.teamId,
  }));

  // Group consecutive teams that landed on the teamId fallback â€” those are
  // the ruleset's *real* residual ambiguities in this season's data.
  const ambiguities: AmbiguousGroup[] = [];
  let cursor = 0;
  while (cursor < rankedWithNames.length) {
    if (rankedWithNames[cursor]!.resolvedBy === "teamId") {
      const group: string[] = [];
      const startRank = rankedWithNames[cursor]!.rank;
      while (
        cursor < rankedWithNames.length &&
        rankedWithNames[cursor]!.resolvedBy === "teamId"
      ) {
        group.push(rankedWithNames[cursor]!.teamId);
        cursor++;
      }
      if (group.length > 0) {
        ambiguities.push({
          teamIds: group,
          teamNames: group.map((id) => teamNameById.get(id) ?? id),
          startingRank: startRank,
        });
      }
    } else {
      cursor++;
    }
  }

  const response: VerifyResponse = {
    seasonId: body.seasonId,
    divisionId: body.divisionId ?? null,
    ruleset: body.ruleset,
    staticWarnings: staticAudit(body.ruleset),
    teamCount: standings.length,
    ranked: rankedWithNames,
    ambiguities,
    rulesetSufficient: ambiguities.length === 0,
  };
  return json(response);
});
