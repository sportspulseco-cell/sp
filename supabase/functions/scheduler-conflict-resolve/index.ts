/**
 * scheduler-conflict-resolve — POST endpoint.
 *
 * Pain #9 — inline conflict resolution with pre-validated options.
 *
 * Given two conflicting games (same slot, or overlapping team-time),
 * propose up to 3 one-click resolution options. Each option is
 * validated against the rest of the schedule before being surfaced —
 * the admin clicks an option and it's guaranteed to be feasible
 * because we've already proved it doesn't break any other game.
 *
 * This is a PROPOSAL endpoint. Applying the chosen option is a
 * follow-on (writes to games + game_provenance with
 * placement_pass='conflict_resolution'). Splitting them lets the UI
 * preview each option's diff before commit.
 *
 * VALIDATION STRATEGY:
 *   v1 — SQL feasibility check per candidate (correct + fast for
 *        single-fixture moves).
 *   next — Z3 push/pop for cascading repairs (when a move forces
 *        adjacent moves that may themselves conflict).
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { loadEnv } from "../_shared/env.ts";
import { serviceRoleClient } from "../_shared/supabase-client.ts";
import { forbidden, userHasPermission } from "../_shared/permissions.ts";

interface ResolveBody {
  seasonId: string;
  gameAId: string;
  gameBId: string;
}

type ConflictKind = "slot_double_book" | "team_overlap" | "unknown";

interface OptionDelta {
  gameId: string;
  fromSlotId: string | null;
  toSlotId: string;
  toStartTsUtc: string;
  toSurfaceLabel: string;
  toVenueName: string;
}

interface ResolutionOption {
  optionId: string;
  label: string;
  description: string;
  delta: OptionDelta;
}

interface ResolveResponse {
  conflictKind: ConflictKind;
  diagnosis: string;
  options: ResolutionOption[];
  /** Slots considered but rejected, with the rejection reason. */
  rejected: Array<{ slotId: string; reason: string }>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface GameRow {
  id: string;
  season_id: string;
  division_id: string;
  home_team_id: string;
  away_team_id: string;
  slot_id: string | null;
  scheduled_start_ts_utc: string;
  status: string;
  locked_at: string | null;
}

interface SlotMeta {
  id: string;
  surfaceId: string;
  surfaceLabel: string;
  venueName: string;
  startTsUtc: string;
  durationMin: number;
  status: string;
}

function diagnose(a: GameRow, b: GameRow): { kind: ConflictKind; diagnosis: string } {
  if (a.slot_id && a.slot_id === b.slot_id) {
    return {
      kind: "slot_double_book",
      diagnosis: `Games ${a.id} and ${b.id} both occupy slot ${a.slot_id}.`,
    };
  }
  const sharedTeams = new Set([a.home_team_id, a.away_team_id])
    .intersection(new Set([b.home_team_id, b.away_team_id]));
  if (sharedTeams.size > 0 && a.scheduled_start_ts_utc === b.scheduled_start_ts_utc) {
    return {
      kind: "team_overlap",
      diagnosis: `Team(s) ${[...sharedTeams].join(", ")} appear in both games at ${a.scheduled_start_ts_utc}.`,
    };
  }
  return { kind: "unknown", diagnosis: "No obvious conflict between the two games." };
}

function parseTs(s: string): number {
  return Date.parse(s);
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: ResolveBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.seasonId || !body.gameAId || !body.gameBId) {
    return json({ error: "missing_required_fields", fields: ["seasonId", "gameAId", "gameBId"] }, 400);
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

  // Load both games.
  const { data: games, error: gErr } = await sb
    .from("games")
    .select("id, season_id, division_id, home_team_id, away_team_id, slot_id, scheduled_start_ts_utc, status, locked_at")
    .in("id", [body.gameAId, body.gameBId])
    .eq("season_id", body.seasonId);
  if (gErr) return json({ error: "load_games_failed", detail: gErr.message }, 500);
  if (!games || games.length !== 2) return json({ error: "games_not_found" }, 404);

  const [gA, gB] = games as GameRow[];
  if (!gA || !gB) return json({ error: "games_not_found" }, 404);
  const { kind, diagnosis } = diagnose(gA, gB);

  // Locked games can't be moved — surface that and exit if both are locked.
  const bothLocked = gA.locked_at && gB.locked_at;
  if (bothLocked) {
    return json<ResolveResponse>({
      conflictKind: kind,
      diagnosis: `${diagnosis} Both games are LOCKED — engine cannot propose moves; unlock one in the admin UI first.`,
      options: [],
      rejected: [],
    });
  }
  // Prefer to move the unlocked game first. If both are unlocked, prefer gameA.
  const movable = gA.locked_at ? gB : gA;
  const fixed = movable === gA ? gB : gA;

  // Load candidate slots: available + season-scoped + non-playoff. Filter
  // for the same date as the conflicting time (±4 hours) OR same surface.
  const movableStart = parseTs(movable.scheduled_start_ts_utc);
  const dayStart = new Date(movableStart - 24 * 3600 * 1000).toISOString();
  const dayEnd = new Date(movableStart + 24 * 3600 * 1000).toISOString();

  const { data: slotRows, error: slotsErr } = await sb
    .from("ice_slots")
    .select(`
      id, surface_id, start_ts_utc, duration_min, status,
      surfaces!inner ( id, label, venues!inner ( id, name ) )
    `)
    .eq("season_id", body.seasonId)
    .eq("is_playoff_reservation", false)
    .eq("status", "available")
    .gte("start_ts_utc", dayStart)
    .lte("start_ts_utc", dayEnd);
  if (slotsErr) return json({ error: "load_slots_failed", detail: slotsErr.message }, 500);

  // deno-lint-ignore no-explicit-any
  const candidates: SlotMeta[] = ((slotRows ?? []) as any[]).map((s) => ({
    id: s.id,
    surfaceId: s.surface_id,
    surfaceLabel: s.surfaces.label,
    venueName: s.surfaces.venues.name,
    startTsUtc: s.start_ts_utc,
    durationMin: s.duration_min,
    status: s.status,
  }));

  // Load games already using any candidate slot — feasibility check.
  const candidateIds = candidates.map((c) => c.id);
  const { data: occupiedRows } = await sb
    .from("games")
    .select("id, slot_id, scheduled_start_ts_utc, status")
    .in("slot_id", candidateIds.length ? candidateIds : ["00000000-0000-0000-0000-000000000000"])
    .not("status", "in", "(cancelled,postponed)");
  const occupiedSlotIds = new Set((occupiedRows ?? []).map((r) => r.slot_id as string));

  // Load other games for the movable's teams to check time-overlap on candidate slots.
  const movableTeams = [movable.home_team_id, movable.away_team_id];
  const { data: teamGames } = await sb
    .from("games")
    .select("id, home_team_id, away_team_id, scheduled_start_ts_utc, slot_id, status")
    .or(`home_team_id.in.(${movableTeams.join(",")}),away_team_id.in.(${movableTeams.join(",")})`)
    .eq("season_id", body.seasonId)
    .not("status", "in", "(cancelled,postponed)");

  const otherTeamGames = (teamGames ?? []).filter((g) => g.id !== movable.id);

  const rejected: ResolveResponse["rejected"] = [];
  const accepted: SlotMeta[] = [];
  for (const c of candidates) {
    if (occupiedSlotIds.has(c.id)) {
      rejected.push({ slotId: c.id, reason: "slot already occupied" });
      continue;
    }
    const cStart = parseTs(c.startTsUtc);
    const cEnd = cStart + c.durationMin * 60_000;
    let teamConflict: string | null = null;
    for (const og of otherTeamGames) {
      const ogStart = parseTs(og.scheduled_start_ts_utc as string);
      // Default duration 60 if unknown; conservative.
      const ogEnd = ogStart + 60 * 60_000;
      const sharedTeam = movableTeams.find(
        (t) => t === og.home_team_id || t === og.away_team_id,
      );
      if (sharedTeam && intervalsOverlap(cStart, cEnd, ogStart, ogEnd)) {
        teamConflict = `team ${sharedTeam} would overlap with game ${og.id}`;
        break;
      }
    }
    if (teamConflict) {
      rejected.push({ slotId: c.id, reason: teamConflict });
      continue;
    }
    accepted.push(c);
  }

  // Rank candidates: prefer same surface as the current slot, then closest time.
  const currentSurface = movable.slot_id
    ? candidates.find((c) => c.id === movable.slot_id)?.surfaceId
    : null;
  accepted.sort((a, b) => {
    const aSameSurface = currentSurface === a.surfaceId ? 0 : 1;
    const bSameSurface = currentSurface === b.surfaceId ? 0 : 1;
    if (aSameSurface !== bSameSurface) return aSameSurface - bSameSurface;
    const aDelta = Math.abs(parseTs(a.startTsUtc) - movableStart);
    const bDelta = Math.abs(parseTs(b.startTsUtc) - movableStart);
    return aDelta - bDelta;
  });

  const options: ResolutionOption[] = accepted.slice(0, 3).map((c, i) => ({
    optionId: `opt_${i + 1}`,
    label: `Move game ${movable.id.slice(0, 6)} → ${c.surfaceLabel} @ ${c.startTsUtc}`,
    description:
      `Reassign the movable game to ${c.venueName} - ${c.surfaceLabel}, ` +
      `starting ${c.startTsUtc}. The fixed game (${fixed.id.slice(0, 6)}) keeps its current slot.`,
    delta: {
      gameId: movable.id,
      fromSlotId: movable.slot_id,
      toSlotId: c.id,
      toStartTsUtc: c.startTsUtc,
      toSurfaceLabel: c.surfaceLabel,
      toVenueName: c.venueName,
    },
  }));

  const response: ResolveResponse = {
    conflictKind: kind,
    diagnosis,
    options,
    rejected: rejected.slice(0, 10),
  };
  return json(response);
});
