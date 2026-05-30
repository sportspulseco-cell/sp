/**
 * scheduler-parity-windows-list — POST endpoint.
 *
 * Read view over parity_windows for a season. Used by the Parity tab.
 * Permission: scheduler.report.read.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

interface ListBody {
  seasonId: string;
}

interface ParityWindowView {
  id: string;
  seasonId: string;
  windowIndex: number;
  startDate: string;
  endDate: string;
  reviewDueDate: string | null;
  state: string;
  recommendationsCount: number;
  decisionsCount: number;
  appliedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  seasonId: string;
  count: number;
  windows: ParityWindowView[];
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
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
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

  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.report.read", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
  });
  if (!allowed) return forbidden("scheduler.report.read permission required");

  const { data: rows, error } = await sb
    .from("parity_windows")
    .select(
      "id, season_id, window_index, start_date, end_date, review_due_date, state, recommendations, decisions, applied_at, created_at",
    )
    .eq("season_id", body.seasonId)
    .order("window_index", { ascending: true });
  if (error) return json({ error: "load_failed", detail: error.message }, 500);

  const windows: ParityWindowView[] = (rows ?? []).map((r) => {
    // deno-lint-ignore no-explicit-any
    const recs = (r.recommendations as any[]) ?? [];
    // deno-lint-ignore no-explicit-any
    const decs = (r.decisions as any[]) ?? [];
    return {
      id: r.id as string,
      seasonId: r.season_id as string,
      windowIndex: Number(r.window_index),
      startDate: r.start_date as string,
      endDate: r.end_date as string,
      reviewDueDate: (r.review_due_date as string | null) ?? null,
      state: r.state as string,
      recommendationsCount: recs.length,
      decisionsCount: decs.length,
      appliedAt: (r.applied_at as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });

  return json<ListResponse>({
    seasonId: body.seasonId,
    count: windows.length,
    windows,
  });
});
