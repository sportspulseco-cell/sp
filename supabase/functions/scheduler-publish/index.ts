/**
 * scheduler-publish â€” POST endpoint.
 *
 * Atomically flips published_at from NULL â†’ now() for every game in
 * the scope and broadcasts a Realtime event so connected clients
 * refresh without polling. Pain #1 fix.
 *
 * Idempotent: only touches rows still NULL.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv, type SchedulerEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

interface PublishBody {
  seasonId: string;
  divisionId?: string;
  scheduleRunId?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Fire-and-forget Realtime broadcast via the canonical REST endpoint.
 * Subscribers listen on topic `schedule:season:<seasonId>` for the
 * `schedule_published` event.
 */
async function broadcastPublish(
  env: SchedulerEnv,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: env.supabaseServiceRoleKey,
        Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic, event: "schedule_published", payload }],
      }),
    });
  } catch (err) {
    // Broadcast failure must not roll back the publish â€” log and move on.
    console.error("realtime broadcast failed:", err);
  }
}

/**
 * Fire-and-forget rink notification dispatch (pain #2). Calls the
 * rink-notify-dispatch Edge Function with the published game ids and
 * event_type='game_scheduled'. Failures are logged but never roll
 * back the publish â€” the outbox row still exists and the cron retry
 * will eventually deliver.
 */
async function dispatchRinkNotifications(
  env: SchedulerEnv,
  authHeader: string,
  gameIds: string[],
): Promise<void> {
  if (gameIds.length === 0) return;
  try {
    await fetch(`${env.supabaseUrl}/functions/v1/rink-notify-dispatch`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gameIds,
        eventType: "game_scheduled",
      }),
    });
  } catch (err) {
    console.error("rink notify dispatch failed:", err);
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: PublishBody;
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
  if (seasonErr || !season) {
    return json({ error: "season_not_found", seasonId: body.seasonId }, 404);
  }

  const allowed = await userHasPermission(sb, userId, "scheduler.publish", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.publish permission required");

  const now = new Date().toISOString();
  let q = sb
    .from("games")
    .update({ published_at: now })
    .eq("season_id", body.seasonId)
    .is("published_at", null);

  if (body.divisionId) q = q.eq("division_id", body.divisionId);
  if (body.scheduleRunId) q = q.eq("schedule_run_id", body.scheduleRunId);

  const { data, error, count } = await q.select("id", { count: "exact" });
  if (error) {
    return json({ error: "publish_failed", detail: error.message }, 500);
  }

  const gamesPublished = count ?? data?.length ?? 0;
  const publishedGameIds = (data ?? []).map((g) => g.id as string);
  const payload = {
    seasonId: body.seasonId,
    divisionId: body.divisionId ?? null,
    scheduleRunId: body.scheduleRunId ?? null,
    publishedAt: now,
    gamesPublished,
  };

  await broadcastPublish(env, `schedule:season:${body.seasonId}`, payload);
  await dispatchRinkNotifications(env, authHeader, publishedGameIds);

  return json(payload);
});
