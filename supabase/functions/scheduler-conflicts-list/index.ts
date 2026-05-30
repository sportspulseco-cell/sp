/**
 * scheduler-conflicts-list — POST endpoint.
 *
 * Auto-detects team-overlap conflicts across a season's games. The
 * DB-level `game_slot_uniq` partial index already prevents slot
 * double-booking, so the only conflict class that can leak into prod
 * is "same team plays two games during overlapping time windows."
 *
 * Time-overlap is computed in-memory: O(n log n) sort + O(n × avg
 * concurrent) scan. PPHL-scale (≤ 1000 games) is sub-50ms.
 *
 * Returns ready-to-render shapes (team names, division name, locked
 * flags) so the UI doesn't have to re-join.
 *
 * Permission: scheduler.report.read.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

const DEFAULT_DURATION_MIN = 60;

interface ListBody {
  seasonId: string;
  divisionId?: string;
}

interface ConflictPair {
  gameAId: string;
  gameBId: string;
  kind: "team_overlap";
  sharedTeamIds: string[];
  sharedTeamNames: string[];
  gameAHome: string;
  gameAAway: string;
  gameBHome: string;
  gameBAway: string;
  gameAStart: string;
  gameBStart: string;
  divisionName: string | null;
  bothLocked: boolean;
  aLocked: boolean;
  bLocked: boolean;
}

interface ListResponse {
  seasonId: string;
  count: number;
  conflicts: ConflictPair[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface GameRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_start_ts_utc: string;
  slot_id: string | null;
  locked_at: string | null;
  division_id: string;
  status: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: ListBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.seasonId) {
    return json({ error: "missing_required_fields", fields: ["seasonId"] }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return forbidden("unauthenticated");

  const { data: season, error: seasonErr } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (seasonErr || !season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.report.read", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  });
  if (!allowed) return forbidden("scheduler.report.read permission required");

  let gq = sb
    .from("games")
    .select(
      "id, home_team_id, away_team_id, scheduled_start_ts_utc, slot_id, locked_at, division_id, status",
    )
    .eq("season_id", body.seasonId)
    .not("status", "in", "(cancelled,postponed)");
  if (body.divisionId) gq = gq.eq("division_id", body.divisionId);
  const { data: games, error: gErr } = await gq;
  if (gErr) return json({ error: "load_games_failed", detail: gErr.message }, 500);

  const rows = (games ?? []) as GameRow[];
  if (rows.length === 0) {
    return json<ListResponse>({ seasonId: body.seasonId, count: 0, conflicts: [] });
  }

  // Hydrate team + division names so the UI renders without re-joins.
  const teamIds = new Set<string>();
  const divIds = new Set<string>();
  for (const g of rows) {
    teamIds.add(g.home_team_id);
    teamIds.add(g.away_team_id);
    divIds.add(g.division_id);
  }
  const [teamsRes, divsRes] = await Promise.all([
    sb.from("teams").select("id, name").in("id", [...teamIds]),
    sb.from("divisions").select("id, name").in("id", [...divIds]),
  ]);
  const teamNameById = new Map<string, string>(
    (teamsRes.data ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const divNameById = new Map<string, string>(
    (divsRes.data ?? []).map((d) => [d.id as string, d.name as string]),
  );

  // Detect time-overlap pairs sharing a team. Sort by start so we can
  // early-exit the inner loop the moment the gap exceeds the duration.
  const sorted = [...rows].sort((a, b) =>
    Date.parse(a.scheduled_start_ts_utc) - Date.parse(b.scheduled_start_ts_utc)
  );

  const conflicts: ConflictPair[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const aStart = Date.parse(a.scheduled_start_ts_utc);
    const aEnd = aStart + DEFAULT_DURATION_MIN * 60_000;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const bStart = Date.parse(b.scheduled_start_ts_utc);
      if (bStart >= aEnd) break; // sorted — no further overlap possible
      const aTeams = new Set([a.home_team_id, a.away_team_id]);
      const shared: string[] = [];
      if (aTeams.has(b.home_team_id)) shared.push(b.home_team_id);
      if (aTeams.has(b.away_team_id)) shared.push(b.away_team_id);
      if (shared.length === 0) continue;
      conflicts.push({
        gameAId: a.id,
        gameBId: b.id,
        kind: "team_overlap",
        sharedTeamIds: shared,
        sharedTeamNames: shared.map((t) => teamNameById.get(t) ?? t),
        gameAHome: teamNameById.get(a.home_team_id) ?? a.home_team_id,
        gameAAway: teamNameById.get(a.away_team_id) ?? a.away_team_id,
        gameBHome: teamNameById.get(b.home_team_id) ?? b.home_team_id,
        gameBAway: teamNameById.get(b.away_team_id) ?? b.away_team_id,
        gameAStart: a.scheduled_start_ts_utc,
        gameBStart: b.scheduled_start_ts_utc,
        divisionName: divNameById.get(a.division_id) ?? null,
        bothLocked: !!(a.locked_at && b.locked_at),
        aLocked: !!a.locked_at,
        bLocked: !!b.locked_at,
      });
    }
  }

  return json<ListResponse>({
    seasonId: body.seasonId,
    count: conflicts.length,
    conflicts,
  });
});
