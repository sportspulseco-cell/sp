/**
 * scheduler-parity-window-create — POST endpoint.
 *
 * Manually creates a parity_windows row in state='pending' so an admin
 * can drive the parity flow end-to-end without waiting for the cron.
 * The next step is scheduler-parity-window-compute to populate the
 * recommendations.
 *
 * Body: { seasonId, windowIndex, startDate (ISO YYYY-MM-DD),
 *         endDate (ISO YYYY-MM-DD), reviewDueDate? }
 * Permission: scheduler.run.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

interface CreateBody {
  seasonId: string;
  windowIndex: number;
  startDate: string;
  endDate: string;
  reviewDueDate?: string | null;
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

  let body: CreateBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId || typeof body.windowIndex !== "number" || !body.startDate || !body.endDate) {
    return json({
      error: "missing_required_fields",
      fields: ["seasonId", "windowIndex", "startDate", "endDate"],
    }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;
  if (!userId) return forbidden("unauthenticated");

  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.run permission required");

  const { data: inserted, error: insErr } = await sb
    .from("parity_windows")
    .insert({
      season_id: body.seasonId,
      window_index: body.windowIndex,
      start_date: body.startDate,
      end_date: body.endDate,
      review_due_date: body.reviewDueDate ?? null,
      state: "pending",
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return json({ error: "create_failed", detail: insErr?.message }, 500);
  }

  return json({ id: inserted.id, state: "pending" });
});
