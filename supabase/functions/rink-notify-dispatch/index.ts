/**
 * rink-notify-dispatch â€” POST endpoint (pain #2).
 *
 * One endpoint, two jobs (idempotent in both):
 *   1. ENQUEUE: for each (gameId, active rink_integration on the game's
 *      venue) pair, insert a rink_notification_outbox row. The
 *      `idempotency_key` (sha256 of gameId|eventType|integrationId|
 *      currentSlotId) dedupes â€” re-running for the same game in the
 *      same slot is a no-op.
 *   2. DISPATCH: walk the venue's pending outbox rows, POST the
 *      payload to the rink's webhook endpoint (kind='webhook'),
 *      update status to delivered or failed (with exp-backoff
 *      next_retry_at). Update the integration's circuit-breaker
 *      health.
 *
 * Replaces Avario's 3-vendor relay (Avario â†’ Sea Coast â†’ Horizon)
 * that silently dropped notifications. Every send is visible,
 * retried automatically, and surfaced in the outbox.
 *
 * Permission: scheduler.rink_notify.dispatch (also accepts
 * scheduler.publish â€” publish fires this fire-and-forget after the
 * games update).
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

const MAX_ATTEMPTS = 5;
const DEFAULT_DURATION_MIN = 60;

interface DispatchBody {
  gameIds: string[];
  eventType:
    | "game_scheduled"
    | "game_rescheduled"
    | "game_cancelled"
    | "game_postponed";
  dryRun?: boolean;
}

interface DispatchResponse {
  enqueued: number;
  alreadyEnqueued: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  noVenue: number;
  noIntegration: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface GameRow {
  id: string;
  season_id: string;
  division_id: string;
  home_team_id: string;
  away_team_id: string;
  slot_id: string | null;
  surface_id: string | null;
  venue_name: string | null;
  surface_label: string | null;
  scheduled_start_ts_utc: string;
  status: string;
}

interface IntegrationRow {
  id: string;
  venue_id: string;
  kind: string;
  endpoint_url: string | null;
  auth_header_name: string | null;
  auth_secret_ref: string | null;
  active: boolean;
  circuit_state: string;
  failure_count: number;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: DispatchBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!Array.isArray(body.gameIds) || body.gameIds.length === 0 || !body.eventType) {
    return json({ error: "missing_required_fields", fields: ["gameIds", "eventType"] }, 400);
  }

  const env = loadEnv();
  const sb = serviceRoleClient(env);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  const appMetadata = (userData?.user?.app_metadata ?? null) as AppMetadata | null;
  if (!userId) return forbidden("unauthenticated");

  // Load games + map to their venues (via surface â†’ venue).
  const { data: games, error: gErr } = await sb
    .from("games")
    .select(
      "id, season_id, division_id, home_team_id, away_team_id, slot_id, surface_id, venue_name, surface_label, scheduled_start_ts_utc, status",
    )
    .in("id", body.gameIds);
  if (gErr) return json({ error: "load_games_failed", detail: gErr.message }, 500);

  const rows = (games ?? []) as GameRow[];
  if (rows.length === 0) {
    return json<DispatchResponse>({
      enqueued: 0, alreadyEnqueued: 0, delivered: 0, failed: 0,
      deadLettered: 0, noVenue: 0, noIntegration: 0,
    });
  }

  // Permission check on the first game's season â€” assume all games are in the
  // same season (typical for publish + conflict-apply callers).
  const seasonId = rows[0]!.season_id;
  const { data: season } = await sb
    .from("seasons")
    .select("id, org_id, league_id")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed =
    (await userHasPermission(sb, userId, "scheduler.rink_notify.dispatch", {
      orgId: season.org_id as string,
      leagueId: season.league_id as string,
      seasonId: season.id as string,
    }, appMetadata)) ||
    (await userHasPermission(sb, userId, "scheduler.publish", {
      orgId: season.org_id as string,
      leagueId: season.league_id as string,
      seasonId: season.id as string,
    }, appMetadata));
  if (!allowed) return forbidden("scheduler.rink_notify.dispatch or scheduler.publish required");

  // Resolve venue per game via surface_id when set.
  const surfaceIds = [
    ...new Set(rows.map((g) => g.surface_id).filter((id): id is string => Boolean(id))),
  ];
  const venueBySurface = new Map<string, string>();
  if (surfaceIds.length > 0) {
    const { data: surfaces } = await sb
      .from("surfaces")
      .select("id, venue_id")
      .in("id", surfaceIds);
    for (const s of surfaces ?? []) {
      venueBySurface.set(s.id as string, s.venue_id as string);
    }
  }

  // Load all active integrations for the venues involved.
  const venueIds = [
    ...new Set(rows.map((g) => (g.surface_id ? venueBySurface.get(g.surface_id) ?? null : null)).filter((id): id is string => Boolean(id))),
  ];
  let integrations: IntegrationRow[] = [];
  if (venueIds.length > 0) {
    const { data } = await sb
      .from("rink_integrations")
      .select("id, venue_id, kind, endpoint_url, auth_header_name, auth_secret_ref, active, circuit_state, failure_count")
      .in("venue_id", venueIds)
      .eq("active", true)
      .is("deleted_at", null);
    integrations = ((data ?? []) as IntegrationRow[]).filter((i) => i.circuit_state !== "open");
  }
  const integrationsByVenue = new Map<string, IntegrationRow[]>();
  for (const i of integrations) {
    const list = integrationsByVenue.get(i.venue_id) ?? [];
    list.push(i);
    integrationsByVenue.set(i.venue_id, list);
  }

  const result: DispatchResponse = {
    enqueued: 0, alreadyEnqueued: 0, delivered: 0, failed: 0,
    deadLettered: 0, noVenue: 0, noIntegration: 0,
  };

  // ===== 1. Enqueue =====
  for (const g of rows) {
    const venueId = g.surface_id ? venueBySurface.get(g.surface_id) ?? null : null;
    if (!venueId) { result.noVenue++; continue; }
    const venueIntegrations = integrationsByVenue.get(venueId) ?? [];
    if (venueIntegrations.length === 0) { result.noIntegration++; continue; }

    for (const integration of venueIntegrations) {
      const idemKey = await sha256Hex(
        `${g.id}|${body.eventType}|${integration.id}|${g.slot_id ?? "none"}|${g.scheduled_start_ts_utc}`,
      );
      const payload = {
        type: body.eventType,
        occurredAt: new Date().toISOString(),
        game: {
          id: g.id,
          seasonId: g.season_id,
          divisionId: g.division_id,
          homeTeamId: g.home_team_id,
          awayTeamId: g.away_team_id,
          scheduledStartTsUtc: g.scheduled_start_ts_utc,
          durationMin: DEFAULT_DURATION_MIN,
          venue: { id: venueId, name: g.venue_name },
          surface: { id: g.surface_id, label: g.surface_label },
          status: g.status,
        },
      };
      if (body.dryRun) { result.enqueued++; continue; }
      const { error: insErr } = await sb
        .from("rink_notification_outbox")
        .insert({
          game_id: g.id,
          rink_integration_id: integration.id,
          event_type: body.eventType,
          payload,
          idempotency_key: idemKey,
          status: "pending",
        });
      if (insErr) {
        // 23505 = unique_violation (already enqueued â€” idempotency)
        if (insErr.code === "23505" || /duplicate key/i.test(insErr.message)) {
          result.alreadyEnqueued++;
        } else {
          console.error("outbox insert failed:", insErr);
        }
      } else {
        result.enqueued++;
      }
    }
  }

  if (body.dryRun) return json(result);

  // ===== 2. Dispatch pending rows for the affected integrations =====
  const integrationIds = [...new Set(integrations.map((i) => i.id))];
  if (integrationIds.length === 0) return json(result);

  const { data: pendingRows } = await sb
    .from("rink_notification_outbox")
    .select("id, rink_integration_id, payload, attempt_count")
    .in("rink_integration_id", integrationIds)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);

  const integrationById = new Map(integrations.map((i) => [i.id, i]));
  for (const row of pendingRows ?? []) {
    const integration = integrationById.get(row.rink_integration_id as string);
    if (!integration) continue;
    if (integration.kind !== "webhook" || !integration.endpoint_url) {
      // For now, only webhook delivery is implemented. Email / vendor
      // adapters land in their own follow-up â€” see DEFERRED note.
      await sb.from("rink_notification_outbox")
        .update({ status: "failed", last_error: `kind ${integration.kind} not implemented`, attempt_count: 1, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      result.failed++;
      continue;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (integration.auth_header_name && integration.auth_secret_ref) {
      // The secret_ref points at Supabase Vault; for now we read it directly
      // as a Function-level secret (env-style). Vault integration is a
      // follow-up.
      const secretFromEnv = Deno.env.get(integration.auth_secret_ref);
      if (secretFromEnv) headers[integration.auth_header_name] = secretFromEnv;
    }

    let ok = false;
    let errorMsg: string | null = null;
    try {
      const res = await fetch(integration.endpoint_url, {
        method: "POST",
        headers,
        body: JSON.stringify(row.payload),
        signal: AbortSignal.timeout(10_000),
      });
      ok = res.ok;
      if (!ok) errorMsg = `HTTP ${res.status}`;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const nextAttempt = (row.attempt_count as number) + 1;
    if (ok) {
      await sb.from("rink_notification_outbox")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          attempt_count: nextAttempt,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await sb.from("rink_integrations")
        .update({
          last_delivery_at: new Date().toISOString(),
          failure_count: 0,
          circuit_state: "closed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
      result.delivered++;
    } else {
      const deadLetter = nextAttempt >= MAX_ATTEMPTS;
      const backoffMs = Math.min(2 ** nextAttempt * 30_000, 3_600_000); // up to 1h
      const nextRetryAt = deadLetter ? null : new Date(Date.now() + backoffMs).toISOString();
      await sb.from("rink_notification_outbox")
        .update({
          status: deadLetter ? "dead_letter" : "pending",
          attempt_count: nextAttempt,
          last_error: errorMsg,
          next_retry_at: nextRetryAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      // Trip the circuit after 3 consecutive failures.
      const newFailureCount = integration.failure_count + 1;
      const newCircuit = newFailureCount >= 3 ? "open" : "closed";
      await sb.from("rink_integrations")
        .update({
          last_failure_at: new Date().toISOString(),
          failure_count: newFailureCount,
          circuit_state: newCircuit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
      if (deadLetter) result.deadLettered++;
      else result.failed++;
    }
  }

  return json<DispatchResponse>(result);
});
