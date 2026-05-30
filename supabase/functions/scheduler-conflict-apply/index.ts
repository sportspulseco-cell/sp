/**
 * scheduler-conflict-apply — POST endpoint.
 *
 * Applies a chosen resolution option from scheduler-conflict-resolve.
 *
 * Re-validates everything propose-time validated (slot still
 * available, no team overlap at the new time) because another admin
 * may have moved a game between propose and apply. The `locked_at IS
 * NULL` filter on the UPDATE re-asserts the sacred invariant at the
 * DB layer — if the game became locked between propose and apply, the
 * UPDATE silently affects zero rows and we 409.
 *
 * On success:
 *   - games row updated (slot_id, surface_id, surface_label,
 *     venue_name, scheduled_start_ts_utc, time_band)
 *   - game_provenance row inserted with placement_pass='conflict_resolution'
 *   - Realtime broadcast on `schedule:season:<id>` (event:
 *     `schedule_updated`) so other admin sessions refresh.
 *
 * Permission: scheduler.resolve_conflict.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv, type SchedulerEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

const DEFAULT_OTHER_DURATION_MIN = 60;

interface ApplyBody {
  seasonId: string;
  gameId: string;
  toSlotId: string;
  reason?: string;
}

interface ApplyResponse {
  ok: true;
  gameId: string;
  newSlot: {
    id: string;
    surfaceLabel: string;
    venueName: string;
    startTsUtc: string;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function broadcastUpdate(
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
        messages: [{ topic, event: "schedule_updated", payload }],
      }),
    });
  } catch (err) {
    console.error("realtime broadcast failed:", err);
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.seasonId || !body.gameId || !body.toSlotId) {
    return json(
      { error: "missing_required_fields", fields: ["seasonId", "gameId", "toSlotId"] },
      400,
    );
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

  const allowed = await userHasPermission(sb, userId, "scheduler.resolve_conflict", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
  });
  if (!allowed) return forbidden("scheduler.resolve_conflict permission required");

  // Load the game.
  const { data: game, error: gErr } = await sb
    .from("games")
    .select(
      "id, season_id, home_team_id, away_team_id, slot_id, locked_at, status",
    )
    .eq("id", body.gameId)
    .maybeSingle();
  if (gErr) return json({ error: "load_game_failed", detail: gErr.message }, 500);
  if (!game) return json({ error: "game_not_found" }, 404);
  if (game.season_id !== body.seasonId) {
    return json({ error: "season_mismatch" }, 400);
  }
  if (game.locked_at) return json({ error: "game_locked" }, 409);

  // Load the target slot + surface + venue.
  const { data: slotRow, error: slotErr } = await sb
    .from("ice_slots")
    .select(`
      id, surface_id, start_ts_utc, duration_min, band, status, is_playoff_reservation,
      surfaces!inner ( id, label, venues!inner ( id, name ) )
    `)
    .eq("id", body.toSlotId)
    .maybeSingle();
  if (slotErr) return json({ error: "load_slot_failed", detail: slotErr.message }, 500);
  if (!slotRow) return json({ error: "slot_not_found" }, 404);
  // deno-lint-ignore no-explicit-any
  const slot = slotRow as any;
  if (slot.is_playoff_reservation) {
    return json({ error: "slot_is_playoff_reservation" }, 409);
  }
  if (slot.status !== "available") return json({ error: "slot_not_available" }, 409);

  // Re-check slot occupancy by another live game.
  const { data: occupiers, error: occErr } = await sb
    .from("games")
    .select("id, status")
    .eq("slot_id", body.toSlotId)
    .neq("id", body.gameId)
    .not("status", "in", "(cancelled,postponed)");
  if (occErr) return json({ error: "occupancy_check_failed", detail: occErr.message }, 500);
  if ((occupiers ?? []).length > 0) return json({ error: "slot_occupied" }, 409);

  // Re-check team overlap at the new time.
  const newStart = Date.parse(slot.start_ts_utc);
  const newEnd = newStart + (slot.duration_min ?? DEFAULT_OTHER_DURATION_MIN) * 60_000;
  const movableTeams = [game.home_team_id, game.away_team_id];
  const { data: teamGames, error: tErr } = await sb
    .from("games")
    .select("id, home_team_id, away_team_id, scheduled_start_ts_utc, status")
    .or(
      `home_team_id.in.(${movableTeams.join(",")}),away_team_id.in.(${movableTeams.join(",")})`,
    )
    .eq("season_id", body.seasonId)
    .neq("id", body.gameId)
    .not("status", "in", "(cancelled,postponed)");
  if (tErr) return json({ error: "team_overlap_check_failed", detail: tErr.message }, 500);
  for (const og of teamGames ?? []) {
    const ogStart = Date.parse(og.scheduled_start_ts_utc as string);
    const ogEnd = ogStart + DEFAULT_OTHER_DURATION_MIN * 60_000;
    if (newStart < ogEnd && ogStart < newEnd) {
      const shared = movableTeams.find(
        (t) => t === og.home_team_id || t === og.away_team_id,
      );
      return json(
        {
          error: "team_overlap_at_new_slot",
          detail: `team ${shared} already plays game ${og.id} at the new slot's time`,
        },
        409,
      );
    }
  }

  // Apply the move. `locked_at IS NULL` re-asserts the sacred invariant
  // at the DB layer; concurrent lock → 0 rows updated → 409.
  const surface = slot.surfaces;
  const venue = surface.venues;
  const { data: updatedRows, error: updErr } = await sb
    .from("games")
    .update({
      slot_id: slot.id,
      surface_id: surface.id,
      surface_label: surface.label,
      venue_name: venue.name,
      scheduled_start_ts_utc: slot.start_ts_utc,
      time_band: slot.band,
    })
    .eq("id", game.id)
    .is("locked_at", null)
    .select("id");
  if (updErr) return json({ error: "update_failed", detail: updErr.message }, 500);
  if (!updatedRows || updatedRows.length === 0) {
    return json({ error: "game_locked_or_missing" }, 409);
  }

  // Provenance row. Schedule run is intentionally NULL — human-driven move.
  const { error: provErr } = await sb.from("game_provenance").insert({
    game_id: game.id,
    schedule_run_id: null,
    placement_pass: "conflict_resolution",
    constraint_ids: ["no_venue_double_book", "no_team_overlap"],
    candidate_slots: [],
    human_actor_id: userId,
    override_reason: body.reason ?? "Conflict resolved via inline option",
  });
  if (provErr) {
    // The move is committed; flag the audit gap but don't fail the request.
    console.error("conflict_resolution provenance insert failed:", provErr);
  }

  await broadcastUpdate(env, `schedule:season:${body.seasonId}`, {
    seasonId: body.seasonId,
    gameId: game.id,
    newSlotId: slot.id,
    newStartTsUtc: slot.start_ts_utc,
    movedAt: new Date().toISOString(),
    movedByUserId: userId,
  });

  return json<ApplyResponse>({
    ok: true,
    gameId: game.id,
    newSlot: {
      id: slot.id,
      surfaceLabel: surface.label,
      venueName: venue.name,
      startTsUtc: slot.start_ts_utc,
    },
  });
});
