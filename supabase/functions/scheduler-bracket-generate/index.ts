/**
 * scheduler-bracket-generate â€” POST endpoint.
 *
 * One-click bracket generation for a division (pain #3). Reads
 * standings, picks the top N teams (where N is a power of 2 in
 * {4, 8, 16}), assigns standard seeded pairings into the season's
 * `is_playoff_reservation=true` ice slots, creates Round 1 games,
 * and persists the full bracket structure. Round 2+ games are
 * created on the fly by scheduler-bracket-advance as winners are
 * determined.
 *
 * Permission: scheduler.run.
 *
 * Idempotent-ish: if an active bracket already exists for the
 * season+division, returns 409 â€” caller must archive it first.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission, type AppMetadata } from "../_shared/permissions.ts";

const SUPPORTED_N = [4, 8, 16] as const;
type SupportedN = typeof SUPPORTED_N[number];

interface GenerateBody {
  seasonId: string;
  divisionId: string;
  format?: "single_elim";
  topN?: SupportedN;
}

interface BracketSlot {
  round: number;
  position: number;
  iceSlotId: string;
  startTsUtc: string;
  surfaceLabel: string;
  venueName: string;
  gameId: string | null;
  seedA: number | null;
  seedB: number | null;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  nextSlotPosition: number | null;
  nextSlotSide: "A" | "B" | null;
}

interface GenerateResponse {
  bracketId: string;
  state: string;
  topN: number;
  slots: BracketSlot[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Standard tournament seed ordering. For N=8 returns
 * [1, 8, 4, 5, 2, 7, 3, 6] â€” pairs of two are the R1 matchups in
 * order so #1's path never meets #2's path before the final.
 */
function seedOrdering(n: number): number[] {
  if (n === 1) return [1];
  const prev = seedOrdering(n / 2);
  const out: number[] = [];
  for (const s of prev) {
    out.push(s);
    out.push(n + 1 - s);
  }
  return out;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: GenerateBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.seasonId || !body.divisionId) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "divisionId"] }, 400);
  }
  const topN = body.topN ?? 8;
  if (!(SUPPORTED_N as readonly number[]).includes(topN)) {
    return json({ error: "unsupported_topN", supported: SUPPORTED_N }, 400);
  }
  const format = body.format ?? "single_elim";

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
    .select("id, org_id, league_id, sport_code")
    .eq("id", body.seasonId)
    .maybeSingle();
  if (!season) return json({ error: "season_not_found" }, 404);

  const allowed = await userHasPermission(sb, userId, "scheduler.run", {
    orgId: season.org_id as string,
    leagueId: season.league_id as string,
    seasonId: season.id as string,
    divisionId: body.divisionId,
  }, appMetadata);
  if (!allowed) return forbidden("scheduler.run permission required");

  // Refuse to overwrite an active bracket.
  const { data: existing } = await sb
    .from("playoff_brackets")
    .select("id, state")
    .eq("season_id", body.seasonId)
    .eq("division_id", body.divisionId)
    .in("state", ["pending", "active"])
    .maybeSingle();
  if (existing) {
    return json({ error: "active_bracket_exists", bracketId: existing.id }, 409);
  }

  // Load top-N teams in the division by standings (points desc, gd desc).
  const { data: entries } = await sb
    .from("division_team_entries")
    .select("team_id")
    .eq("division_id", body.divisionId)
    .in("entry_status", ["applied", "accepted", "confirmed"])
    .is("left_at", null);
  const eligibleTeamIds = (entries ?? []).map((e) => e.team_id as string);
  if (eligibleTeamIds.length < topN) {
    return json({ error: "insufficient_teams", required: topN, have: eligibleTeamIds.length }, 422);
  }
  const { data: standings } = await sb
    .from("standings")
    .select("team_id, points, gd")
    .eq("league_id", season.league_id)
    .in("team_id", eligibleTeamIds);
  const standMap = new Map(
    (standings ?? []).map((s) => [s.team_id as string, { points: Number(s.points ?? 0), gd: Number(s.gd ?? 0) }]),
  );
  const ranked = [...eligibleTeamIds].sort((a, b) => {
    const sa = standMap.get(a) ?? { points: 0, gd: 0 };
    const sb_ = standMap.get(b) ?? { points: 0, gd: 0 };
    if (sb_.points !== sa.points) return sb_.points - sa.points;
    if (sb_.gd !== sa.gd) return sb_.gd - sa.gd;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const seedMap = ranked.slice(0, topN);

  // Total slots needed: topN/2 + topN/4 + ... + 1 = topN - 1.
  const totalRounds = Math.log2(topN);
  const totalSlots = topN - 1;

  // Load available playoff slots for the season (status='available').
  const { data: iceSlotRows } = await sb
    .from("ice_slots")
    .select(`
      id, surface_id, start_ts_utc, status,
      surfaces!inner ( id, label, venues!inner ( id, name ) )
    `)
    .eq("season_id", body.seasonId)
    .eq("is_playoff_reservation", true)
    .eq("status", "available")
    .order("start_ts_utc", { ascending: true });
  const iceSlots = (iceSlotRows ?? []) as Array<{
    id: string;
    surface_id: string;
    start_ts_utc: string;
    // deno-lint-ignore no-explicit-any
    surfaces: any;
  }>;
  if (iceSlots.length < totalSlots) {
    return json(
      { error: "insufficient_playoff_slots", required: totalSlots, have: iceSlots.length },
      422,
    );
  }

  // Build bracket structure round-by-round.
  const r1Seeds = seedOrdering(topN); // length = topN
  const slots: BracketSlot[] = [];
  let iceIdx = 0;
  for (let round = 1; round <= totalRounds; round++) {
    const slotsInRound = topN / Math.pow(2, round);
    for (let position = 0; position < slotsInRound; position++) {
      const ice = iceSlots[iceIdx++]!;
      const isLastRound = round === totalRounds;
      const slot: BracketSlot = {
        round,
        position,
        iceSlotId: ice.id,
        startTsUtc: ice.start_ts_utc,
        surfaceLabel: ice.surfaces.label,
        venueName: ice.surfaces.venues.name,
        gameId: null,
        seedA: round === 1 ? r1Seeds[position * 2]! : null,
        seedB: round === 1 ? r1Seeds[position * 2 + 1]! : null,
        teamAId: round === 1 ? seedMap[r1Seeds[position * 2]! - 1]! : null,
        teamBId: round === 1 ? seedMap[r1Seeds[position * 2 + 1]! - 1]! : null,
        winnerTeamId: null,
        nextSlotPosition: isLastRound ? null : Math.floor(position / 2),
        nextSlotSide: isLastRound ? null : (position % 2 === 0 ? "A" : "B"),
      };
      slots.push(slot);
    }
  }

  // Insert the bracket row first (so games can reference it via metadata
  // if we wanted; for now schedule_run_id stays null on bracket games).
  const { data: bracketRow, error: brkErr } = await sb
    .from("playoff_brackets")
    .insert({
      season_id: body.seasonId,
      division_id: body.divisionId,
      format,
      state: "active",
      seed_map: seedMap,
      slots,
      generated_by_user_id: userId,
      generated_at: new Date().toISOString(),
      metadata: { topN },
    })
    .select("id")
    .single();
  if (brkErr || !bracketRow) {
    return json({ error: "bracket_insert_failed", detail: brkErr?.message }, 500);
  }
  const bracketId = bracketRow.id as string;

  // Create R1 games.
  const r1Slots = slots.filter((s) => s.round === 1);
  const gameRows: Record<string, unknown>[] = [];
  const provRows: Record<string, unknown>[] = [];
  for (const slot of r1Slots) {
    const gameId = crypto.randomUUID();
    gameRows.push({
      id: gameId,
      league_id: season.league_id,
      season_id: body.seasonId,
      division_id: body.divisionId,
      sport_code: season.sport_code,
      home_team_id: slot.teamAId,
      away_team_id: slot.teamBId,
      scheduled_start_ts_utc: slot.startTsUtc,
      venue_name: slot.venueName,
      surface_label: slot.surfaceLabel,
      slot_id: slot.iceSlotId,
      surface_id: iceSlots.find((s) => s.id === slot.iceSlotId)!.surface_id,
      source: "generated",
      game_type: "playoff",
      status: "scheduled",
    });
    provRows.push({
      game_id: gameId,
      placement_pass: "bracket",
      constraint_ids: ["no_venue_double_book"],
    });
    slot.gameId = gameId;
  }
  const { error: insErr } = await sb.from("games").insert(gameRows);
  if (insErr) {
    return json({ error: "round1_insert_failed", detail: insErr.message }, 500);
  }
  await sb.from("game_provenance").insert(provRows);

  // Patch the bracket with the gameIds we just assigned to R1.
  await sb
    .from("playoff_brackets")
    .update({ slots, updated_at: new Date().toISOString() })
    .eq("id", bracketId);

  return json<GenerateResponse>({
    bracketId,
    state: "active",
    topN,
    slots,
  });
});
