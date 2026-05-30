/**
 * rink-notifications-list — POST endpoint (pain #2 read view).
 *
 * One call returns everything the admin UI needs:
 *   - per-venue integrations with health (circuit_state, last delivery,
 *     last failure, current failure count)
 *   - recent outbox rows for those venues (status, attempts, errors)
 *
 * Permission: scheduler.rink_notify.read.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

interface ListBody {
  seasonId: string;
  limit?: number;
}

interface IntegrationView {
  id: string;
  venueId: string;
  venueName: string;
  kind: string;
  endpointUrl: string | null;
  active: boolean;
  circuitState: string;
  failureCount: number;
  lastDeliveryAt: string | null;
  lastFailureAt: string | null;
}

interface OutboxView {
  id: string;
  gameId: string | null;
  rinkIntegrationId: string;
  venueName: string | null;
  eventType: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface ListResponse {
  seasonId: string;
  integrations: IntegrationView[];
  outbox: OutboxView[];
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
  if (!userId) return forbidden("unauthenticated");

  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.rink_notify.read", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
  });
  if (!allowed) return forbidden("scheduler.rink_notify.read permission required");

  // Find every venue used by this season's games (via surface_id → venue).
  const { data: gameRows } = await sb
    .from("games")
    .select("surface_id, surfaces!inner ( venue_id, venues!inner ( id, name ) )")
    .eq("season_id", body.seasonId)
    .not("surface_id", "is", null)
    .limit(500);
  // deno-lint-ignore no-explicit-any
  const venueIdSet = new Set<string>();
  const venueNameById = new Map<string, string>();
  for (const r of (gameRows ?? []) as any[]) {
    const venue = r.surfaces?.venues;
    if (venue?.id) {
      venueIdSet.add(venue.id as string);
      venueNameById.set(venue.id as string, venue.name as string);
    }
  }
  const venueIds = [...venueIdSet];

  let integrations: IntegrationView[] = [];
  let outbox: OutboxView[] = [];

  if (venueIds.length > 0) {
    const { data: intRows } = await sb
      .from("rink_integrations")
      .select(
        "id, venue_id, kind, endpoint_url, active, circuit_state, failure_count, last_delivery_at, last_failure_at",
      )
      .in("venue_id", venueIds)
      .is("deleted_at", null)
      .order("venue_id", { ascending: true });
    integrations = (intRows ?? []).map((r) => ({
      id: r.id as string,
      venueId: r.venue_id as string,
      venueName: venueNameById.get(r.venue_id as string) ?? "",
      kind: r.kind as string,
      endpointUrl: (r.endpoint_url as string | null) ?? null,
      active: r.active as boolean,
      circuitState: r.circuit_state as string,
      failureCount: Number(r.failure_count ?? 0),
      lastDeliveryAt: (r.last_delivery_at as string | null) ?? null,
      lastFailureAt: (r.last_failure_at as string | null) ?? null,
    }));

    const integrationIds = integrations.map((i) => i.id);
    if (integrationIds.length > 0) {
      const { data: outRows } = await sb
        .from("rink_notification_outbox")
        .select(
          "id, game_id, rink_integration_id, event_type, status, attempt_count, last_error, next_retry_at, delivered_at, created_at",
        )
        .in("rink_integration_id", integrationIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(body.limit ?? 100, 1), 500));
      const venueByIntegration = new Map(integrations.map((i) => [i.id, i.venueName]));
      outbox = (outRows ?? []).map((r) => ({
        id: r.id as string,
        gameId: (r.game_id as string | null) ?? null,
        rinkIntegrationId: r.rink_integration_id as string,
        venueName: venueByIntegration.get(r.rink_integration_id as string) ?? null,
        eventType: r.event_type as string,
        status: r.status as string,
        attemptCount: Number(r.attempt_count ?? 0),
        lastError: (r.last_error as string | null) ?? null,
        nextRetryAt: (r.next_retry_at as string | null) ?? null,
        deliveredAt: (r.delivered_at as string | null) ?? null,
        createdAt: r.created_at as string,
      }));
    }
  }

  return json<ListResponse>({
    seasonId: body.seasonId,
    integrations,
    outbox,
  });
});
