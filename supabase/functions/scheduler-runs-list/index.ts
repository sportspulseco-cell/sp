/**
 * scheduler-runs-list â€” POST endpoint.
 *
 * Read view of the schedule_runs table for a season (optionally
 * scoped to a division). Used by the admin /scheduling/[id]/runs
 * page for forensics: "why did the engine put X here?" â€” the
 * stored `solution` + `constraint_snapshot` are the answer.
 *
 * Returns ready-to-render rows with the division name hydrated
 * server-side. The full `solution` jsonb is NOT included (potentially
 * large) â€” fetch a single run via /scheduler-runs-get if you need it.
 *
 * Permission: scheduler.report.read.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

interface ListBody {
  seasonId: string;
  divisionId?: string;
  limit?: number;
}

interface ScheduleRunListItem {
  id: string;
  seasonId: string;
  divisionId: string | null;
  divisionName: string | null;
  engine: string;
  seed: string;
  inputHash: string;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  gamesCreated: number;
  gamesLockedPreserved: number;
  durationMs: number | null;
  ranByUserId: string | null;
  ranAt: string;
  infeasibilitySummary: string | null;
}

interface ListResponse {
  seasonId: string;
  divisionId: string | null;
  count: number;
  runs: ScheduleRunListItem[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;
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
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.report.read permission required");

  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);

  let rq = sb
    .from("schedule_runs")
    .select(
      "id, season_id, division_id, engine, seed, input_hash, status, games_created, games_locked_preserved, duration_ms, ran_by_user_id, ran_at, infeasibility_report",
    )
    .eq("season_id", body.seasonId)
    .order("ran_at", { ascending: false })
    .limit(limit);
  if (body.divisionId) rq = rq.eq("division_id", body.divisionId);
  const { data: rows, error: runsErr } = await rq;
  if (runsErr) return json({ error: "load_runs_failed", detail: runsErr.message }, 500);

  // Hydrate division names.
  const divIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.division_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const divNameById = new Map<string, string>();
  if (divIds.length > 0) {
    const { data: divs } = await sb
      .from("divisions")
      .select("id, name")
      .in("id", divIds);
    for (const d of divs ?? []) divNameById.set(d.id as string, d.name as string);
  }

  const runs: ScheduleRunListItem[] = (rows ?? []).map((r) => {
    // deno-lint-ignore no-explicit-any
    const inf = (r as any).infeasibility_report;
    const summary =
      inf && typeof inf === "object" && typeof inf.summary === "string"
        ? (inf.summary as string)
        : null;
    return {
      id: r.id as string,
      seasonId: r.season_id as string,
      divisionId: (r.division_id as string | null) ?? null,
      divisionName: r.division_id
        ? (divNameById.get(r.division_id as string) ?? null)
        : null,
      engine: r.engine as string,
      seed: r.seed as string,
      inputHash: r.input_hash as string,
      status: r.status as ScheduleRunListItem["status"],
      gamesCreated: Number(r.games_created ?? 0),
      gamesLockedPreserved: Number(r.games_locked_preserved ?? 0),
      durationMs: r.duration_ms !== null ? Number(r.duration_ms) : null,
      ranByUserId: (r.ran_by_user_id as string | null) ?? null,
      ranAt: r.ran_at as string,
      infeasibilitySummary: summary,
    };
  });

  return json<ListResponse>({
    seasonId: body.seasonId,
    divisionId: body.divisionId ?? null,
    count: runs.length,
    runs,
  });
});
