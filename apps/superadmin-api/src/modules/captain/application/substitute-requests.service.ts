import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  SCHEDULABLE_ENTRY_STATUSES,
  SUB_CANCEL_REASONS,
  SUB_REQUEST_STATUS_LABELS,
  describeSubReasons,
  formatInZone,
  freeAgentAvailableFor,
  freeAgentLevelLabel,
  freeAgentPositionLabel,
  localDayAndHour,
  normalizeSkillLevel,
  subAdminMayOverride,
  subIneligibleReasons,
  subLevelFit,
  subRequestStatus,
  type SubCancelReason,
  type SubIneligibleReason,
  type SubLogEntry,
  type SubRequestStatus,
  type SubSource
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { playerWebUrl } from "../../../shared/app-urls";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { loadAdminScope } from "../../../shared/auth/scope";
import { notifyAudience } from "../../../shared/audience/notify-audience";
import { NotificationService } from "../../communications/application/notification.service";
import type { TemplateCode } from "../../communications/domain/templates/catalog";
import { suspensionBlocksForGame } from "../../game-operations/application/suspensions/suspension-rules";
import {
  addGameGuest,
  countGameGuests,
  lockGameGuests,
  teamDivisionInSeason
} from "./game-guests";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Exec = Database | Tx;
type RequestRow = typeof schema.substituteRequests.$inferSelect;

/** Game statuses in which a captain may ask and a sub may accept. */
const ASK_STATUSES = ["scheduled"];
/** Game statuses in which a league admin may still assign a sub. */
const ADMIN_ASSIGN_STATUSES = ["scheduled", "postponed", "in_play"];
/** Game statuses that can clash with this one for a rostered player. */
const BUSY_STATUSES = ["scheduled", "in_play"];

interface GameCtx {
  id: string;
  leagueId: string;
  orgId: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  start: Date;
  durationMin: number;
  tz: string;
  status: string;
  venueName: string | null;
}

export interface SubCandidateView {
  personId: string;
  name: string;
  source: SubSource;
  sourceTeamName: string | null;
  level: string | null;
  levelLabel: string | null;
  positions: string[];
  positionLabels: string[];
  eligible: boolean;
  reasons: SubIneligibleReason[];
  reasonText: string;
  /** A league admin may assign them anyway (override). */
  adminOverridable: boolean;
  /** An open request for this game, from any team. */
  openRequest: { id: string; teamId: string } | null;
}

export interface SubRequestView {
  id: string;
  gameId: string;
  teamId: string;
  teamName: string;
  personId: string;
  personName: string;
  status: SubRequestStatus;
  statusLabel: string;
  source: string | null;
  rosterOverride: boolean;
  note: string | null;
  cancelReason: string | null;
  cancelReasonText: string | null;
  createdAt: string;
  decidedAt: string | null;
  attendanceId: string | null;
  log: SubLogEntry[];
  game: {
    startsAt: string;
    tz: string;
    status: string;
    venueName: string | null;
    homeTeamName: string;
    awayTeamName: string;
    opponentName: string;
    when: string;
  };
}

export interface TeamSubsView {
  teamId: string;
  teamName: string;
  division: { id: string; name: string; tier: string | null } | null;
  rules: { maxGuestPlayersPerGame: number; guestPlayerSeasonLimit: number };
  guestsThisGame: number;
  guests: Array<{ attendanceId: string; personId: string; name: string; viaRequestId: string | null; rosterOverride: boolean }>;
  requests: SubRequestView[];
  candidates: SubCandidateView[];
}

function personName(p: { first: string | null; last: string | null; preferred: string | null }): string {
  return (
    (p.preferred && p.preferred.trim()) ||
    [p.first, p.last].filter(Boolean).join(" ").trim() ||
    "Unnamed player"
  );
}

function logEntry(status: SubRequestStatus, byUserId: string | null, note?: string): SubLogEntry {
  return { at: new Date().toISOString(), status, byUserId, ...(note ? { note } : {}) };
}

function appendLog(entry: SubLogEntry) {
  return sql`${schema.substituteRequests.log} || ${JSON.stringify([entry])}::jsonb`;
}

/**
 * Substitute requests (UC-31, FR-3.3.1, FR-3.3.3). The server is the
 * authority on every transition:
 *
 *   captain asks       -> row `requested` (eligibility re-checked here,
 *                         one open request per player per game), sub told
 *                         in-app and by email
 *   sub accepts        -> eligibility re-checked, the one guest path adds
 *                         them to the game (game_attendance is_guest +
 *                         roster_moves guest_add), row `accepted` with the
 *                         attendance id, captain told, league admins told;
 *                         when that filled the last guest spot the team's
 *                         other open requests are cancelled and their subs
 *                         told
 *   sub declines       -> row `declined`, captain told
 *   captain cancels    -> row `cancelled`, sub told
 *   game starts        -> an open row reads `expired` and is written
 *                         `expired` the next time anyone acts on it
 *   admin assigns      -> the guest path, row `accepted` with
 *                         roster_override = true, sub and captains told
 *
 * Every transition locks the row (or the game's guest list) in one
 * transaction, so a double click returns the same result instead of a
 * second guest.
 */
@Injectable()
export class SubstituteRequestsService {
  private readonly log = new Logger(SubstituteRequestsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly config: ConfigService
  ) {}

  // ===================================================================
  // Loading and access
  // ===================================================================

  private async loadGame(gameId: string, exec: Exec = this.db, opts: { allowSeasonless?: boolean } = {}): Promise<GameCtx | null> {
    const home = sql<string>`(select name from teams where id = ${schema.games.homeTeamId})`;
    const away = sql<string>`(select name from teams where id = ${schema.games.awayTeamId})`;
    const [g] = await exec
      .select({
        id: schema.games.id,
        leagueId: schema.games.leagueId,
        orgId: schema.leagues.orgId,
        gameSeasonId: schema.games.seasonId,
        divisionSeasonId: schema.divisions.seasonId,
        homeTeamId: schema.games.homeTeamId,
        awayTeamId: schema.games.awayTeamId,
        homeTeamName: home,
        awayTeamName: away,
        start: schema.games.scheduledStartTsUtc,
        durationMin: schema.games.durationMin,
        tz: schema.games.tz,
        status: schema.games.status,
        venueName: schema.games.venueName
      })
      .from(schema.games)
      .innerJoin(schema.leagues, eq(schema.leagues.id, schema.games.leagueId))
      .leftJoin(schema.divisions, eq(schema.divisions.id, schema.games.divisionId))
      .where(eq(schema.games.id, gameId))
      .limit(1);
    if (!g) return null;
    const seasonId = g.gameSeasonId ?? g.divisionSeasonId ?? null;
    // Older games carry no season; only the admin view reads them ("" = none).
    if (!seasonId && !opts.allowSeasonless) return null;
    return {
      id: g.id,
      leagueId: g.leagueId,
      orgId: g.orgId,
      seasonId: seasonId ?? "",
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeTeamName: g.homeTeamName ?? "Home",
      awayTeamName: g.awayTeamName ?? "Away",
      start: g.start,
      durationMin: g.durationMin,
      tz: g.tz,
      status: g.status,
      venueName: g.venueName
    };
  }

  /** The captain's team and one of its games; 404 for anything outside that. */
  async requireCaptainGame(userId: string, teamId: string, gameId: string) {
    const [team] = await this.db
      .select({ id: schema.teams.id, name: schema.teams.name, orgId: schema.teams.orgId, captainUserId: schema.teams.captainUserId })
      .from(schema.teams)
      .where(and(eq(schema.teams.id, teamId), isNull(schema.teams.deletedAt)))
      .limit(1);
    if (!team || !(await userIsCaptainOfTeam(this.db, userId, teamId, team.captainUserId))) {
      this.log.warn(`captain subs refused user=${userId} team=${teamId}: not captain`);
      throw new NotFoundException("Team not found");
    }
    const game = await this.loadGame(gameId);
    if (!game || (game.homeTeamId !== teamId && game.awayTeamId !== teamId)) {
      throw new NotFoundException("Game not found");
    }
    return { team, game };
  }

  /** A league / org admin whose admin scope covers the game; 404 otherwise. */
  async requireAdminGame(userId: string, gameId: string, opts: { allowSeasonless?: boolean } = {}): Promise<GameCtx> {
    const game = await this.loadGame(gameId, this.db, opts);
    const scope = await loadAdminScope(this.db, userId);
    const inScope =
      !!game &&
      (scope.isSuperAdmin ||
        scope.leagueIds === null ||
        scope.leagueIds.includes(game.leagueId) ||
        (scope.orgWideOrgIds ?? []).includes(game.orgId));
    if (!game || !inScope) {
      this.log.warn(`admin subs refused user=${userId} game=${gameId}: outside admin scope`);
      throw new NotFoundException("Game not found");
    }
    return game;
  }

  // ===================================================================
  // Eligibility (FR-3.3.3)
  // ===================================================================

  /**
   * Who may sub for `teamId` in this game: active free agents in the
   * game's season, and players rostered in the same division level (the
   * same tier, or the same division when it has no tier) on other teams.
   * Each comes back with the reasons they cannot be asked, if any.
   * `personIds` narrows it to those people (re-checks on a transition).
   */
  async candidatesFor(
    exec: Exec,
    game: GameCtx,
    teamId: string,
    opts: { personIds?: string[] } = {}
  ): Promise<SubCandidateView[]> {
    const only = opts.personIds;
    if (only && only.length === 0) return [];
    const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
    const division = await teamDivisionInSeason(exec, teamId, game.seasonId);
    const rules = division?.rules;
    const seasonLimit = rules?.guestPlayerSeasonLimit ?? 5;

    const freeAgents = await exec
      .select({
        personId: schema.freeAgentPoolEntries.playerPersonId,
        positions: schema.freeAgentPoolEntries.positions,
        availability: schema.freeAgentPoolEntries.availability,
        levelPrimary: schema.freeAgentPoolEntries.levelPrimary,
        levelFlexibility: schema.freeAgentPoolEntries.levelFlexibility
      })
      .from(schema.freeAgentPoolEntries)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.freeAgentPoolEntries.playerPersonId))
      .where(
        and(
          eq(schema.freeAgentPoolEntries.seasonId, game.seasonId),
          eq(schema.freeAgentPoolEntries.status, "active"),
          isNull(schema.persons.deletedAt),
          only ? inArray(schema.freeAgentPoolEntries.playerPersonId, only) : undefined
        )
      );

    // Rostered in the same level: same tier in this season, or the same
    // division when the division has no tier. Not this team, not the
    // opponent (they play in this game already).
    const levelPlayers = division
      ? await exec
          .select({
            personId: schema.teamMemberships.personId,
            positionCode: schema.teamMemberships.positionCode,
            teamName: schema.teams.name,
            tier: schema.divisions.tier
          })
          .from(schema.teamMemberships)
          .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMemberships.teamId))
          .innerJoin(schema.divisionTeamEntries, eq(schema.divisionTeamEntries.teamId, schema.teamMemberships.teamId))
          .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
          .innerJoin(schema.persons, eq(schema.persons.id, schema.teamMemberships.personId))
          .where(
            and(
              eq(schema.teamMemberships.seasonId, game.seasonId),
              eq(schema.teamMemberships.currentStatus, "active"),
              eq(schema.divisions.seasonId, game.seasonId),
              inArray(schema.divisionTeamEntries.entryStatus, [...SCHEDULABLE_ENTRY_STATUSES]),
              isNull(schema.divisionTeamEntries.leftAt),
              isNull(schema.teams.deletedAt),
              isNull(schema.persons.deletedAt),
              ne(schema.teamMemberships.teamId, teamId),
              ne(schema.teamMemberships.teamId, opponentId),
              division.tier ? eq(schema.divisions.tier, division.tier) : eq(schema.divisions.id, division.id),
              only ? inArray(schema.teamMemberships.personId, only) : undefined
            )
          )
      : [];

    type Raw = {
      personId: string;
      source: SubSource;
      sourceTeamName: string | null;
      levels: string[];
      levelCode: string | null;
      positions: string[];
      availability: Record<string, unknown> | null;
    };
    const byPerson = new Map<string, Raw>();
    for (const f of freeAgents) {
      byPerson.set(f.personId, {
        personId: f.personId,
        source: "free_agent",
        sourceTeamName: null,
        levels: [f.levelPrimary, ...(f.levelFlexibility ?? [])],
        levelCode: normalizeSkillLevel(f.levelPrimary) ?? f.levelPrimary,
        positions: f.positions ?? [],
        availability: (f.availability as Record<string, unknown>) ?? {}
      });
    }
    for (const p of levelPlayers) {
      const have = byPerson.get(p.personId);
      if (have) {
        if (p.positionCode && !have.positions.includes(p.positionCode)) have.positions.push(p.positionCode);
        continue;
      }
      byPerson.set(p.personId, {
        personId: p.personId,
        source: "league_player",
        sourceTeamName: p.teamName,
        levels: p.tier ? [p.tier] : [],
        levelCode: p.tier,
        positions: p.positionCode ? [p.positionCode] : [],
        availability: null
      });
    }
    const ids = [...byPerson.keys()];
    if (ids.length === 0) return [];

    const end = new Date(game.start.getTime() + game.durationMin * 60_000);
    const [people, memberships, listed, guestCounts, openReqs, blocked] = await Promise.all([
      exec
        .select({
          id: schema.persons.id,
          userId: schema.persons.userId,
          first: schema.persons.legalFirstName,
          last: schema.persons.legalLastName,
          preferred: schema.persons.preferredName
        })
        .from(schema.persons)
        .where(inArray(schema.persons.id, ids)),
      exec
        .select({ personId: schema.teamMemberships.personId, teamId: schema.teamMemberships.teamId, seasonId: schema.teamMemberships.seasonId })
        .from(schema.teamMemberships)
        .where(and(inArray(schema.teamMemberships.personId, ids), eq(schema.teamMemberships.currentStatus, "active"))),
      exec
        .select({ personId: schema.gameAttendance.personId })
        .from(schema.gameAttendance)
        .where(and(eq(schema.gameAttendance.gameId, game.id), inArray(schema.gameAttendance.personId, ids))),
      exec
        .select({ personId: schema.gameAttendance.personId, n: sql<number>`count(*)::int` })
        .from(schema.gameAttendance)
        .innerJoin(schema.games, eq(schema.games.id, schema.gameAttendance.gameId))
        .where(
          and(
            inArray(schema.gameAttendance.personId, ids),
            eq(schema.gameAttendance.teamId, teamId),
            eq(schema.gameAttendance.isGuest, true),
            eq(schema.games.seasonId, game.seasonId)
          )
        )
        .groupBy(schema.gameAttendance.personId),
      exec
        .select({ id: schema.substituteRequests.id, personId: schema.substituteRequests.substitutePersonId, teamId: schema.substituteRequests.teamId })
        .from(schema.substituteRequests)
        .where(
          and(
            eq(schema.substituteRequests.gameId, game.id),
            eq(schema.substituteRequests.status, "requested"),
            inArray(schema.substituteRequests.substitutePersonId, ids)
          )
        ),
      suspensionBlocksForGame(exec, { game: { id: game.id, start: game.start }, teamId, personIds: ids })
    ]);

    // Their own games that overlap this one (rostered players only).
    const teamsOf = new Map<string, Set<string>>();
    for (const m of memberships) {
      const set = teamsOf.get(m.personId) ?? new Set<string>();
      set.add(m.teamId);
      teamsOf.set(m.personId, set);
    }
    const otherTeams = [...new Set(memberships.map((m) => m.teamId))].filter((t) => t !== teamId && t !== opponentId);
    const clashes = otherTeams.length
      ? await exec
          .select({
            home: schema.games.homeTeamId,
            away: schema.games.awayTeamId,
            start: schema.games.scheduledStartTsUtc,
            durationMin: schema.games.durationMin
          })
          .from(schema.games)
          .where(
            and(
              ne(schema.games.id, game.id),
              inArray(schema.games.status, BUSY_STATUSES),
              or(inArray(schema.games.homeTeamId, otherTeams), inArray(schema.games.awayTeamId, otherTeams)),
              gte(schema.games.scheduledStartTsUtc, new Date(game.start.getTime() - 6 * 3_600_000)),
              lt(schema.games.scheduledStartTsUtc, end)
            )
          )
      : [];
    const busyTeams = new Set<string>();
    for (const c of clashes) {
      const cEnd = c.start.getTime() + c.durationMin * 60_000;
      if (c.start.getTime() < end.getTime() && cEnd > game.start.getTime()) {
        busyTeams.add(c.home);
        busyTeams.add(c.away);
      }
    }

    const personById = new Map(people.map((p) => [p.id, p]));
    const listedSet = new Set(listed.map((l) => l.personId));
    const guestN = new Map(guestCounts.map((g) => [g.personId, g.n]));
    const openBy = new Map(openReqs.map((r) => [r.personId, { id: r.id, teamId: r.teamId }]));
    const blockedSet = new Set(blocked.map((b) => b.personId));
    const slot = localDayAndHour(game.start, game.tz);

    const out: SubCandidateView[] = [];
    for (const r of byPerson.values()) {
      const person = personById.get(r.personId);
      if (!person) continue;
      const mine = [...(teamsOf.get(r.personId) ?? new Set<string>())];
      const seasonTeams = memberships.filter((m) => m.personId === r.personId && m.seasonId === game.seasonId);
      const reasons = subIneligibleReasons({
        source: r.source,
        onThisTeam: seasonTeams.some((m) => m.teamId === teamId),
        inGame: listedSet.has(r.personId) || seasonTeams.some((m) => m.teamId === opponentId),
        suspended: blockedSet.has(r.personId),
        availability: r.source === "free_agent" ? freeAgentAvailableFor(r.availability, slot) : null,
        busyOtherGame: mine.some((t) => busyTeams.has(t)),
        level: r.source === "free_agent" ? subLevelFit(r.levels, division?.tier ?? null) : "match",
        guestAppearances: guestN.get(r.personId) ?? 0,
        guestSeasonLimit: seasonLimit,
        hasAccount: !!person.userId
      });
      out.push({
        personId: r.personId,
        name: personName(person),
        source: r.source,
        sourceTeamName: r.sourceTeamName,
        level: r.levelCode,
        levelLabel: r.levelCode ? freeAgentLevelLabel(r.levelCode) : null,
        positions: r.positions,
        positionLabels: r.positions.map(freeAgentPositionLabel),
        eligible: reasons.length === 0,
        reasons,
        reasonText: describeSubReasons(reasons),
        adminOverridable: subAdminMayOverride(reasons),
        openRequest: openBy.get(r.personId) ?? null
      });
    }
    return out.sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        Number(a.source === "league_player") - Number(b.source === "league_player") ||
        a.name.localeCompare(b.name)
    );
  }

  // ===================================================================
  // Views
  // ===================================================================

  private async requestViews(exec: Exec, where: ReturnType<typeof and>): Promise<SubRequestView[]> {
    const now = new Date();
    const rows = await exec
      .select({
        r: schema.substituteRequests,
        teamName: schema.teams.name,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName,
        start: schema.games.scheduledStartTsUtc,
        tz: schema.games.tz,
        gameStatus: schema.games.status,
        venueName: schema.games.venueName,
        homeTeamId: schema.games.homeTeamId,
        homeTeamName: sql<string>`(select name from teams where id = ${schema.games.homeTeamId})`,
        awayTeamName: sql<string>`(select name from teams where id = ${schema.games.awayTeamId})`
      })
      .from(schema.substituteRequests)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.substituteRequests.teamId))
      .innerJoin(schema.persons, eq(schema.persons.id, schema.substituteRequests.substitutePersonId))
      .innerJoin(schema.games, eq(schema.games.id, schema.substituteRequests.gameId))
      .where(where)
      .orderBy(desc(schema.substituteRequests.createdAt));
    return rows.map((x) => {
      const status = subRequestStatus(x.r.status, { start: x.start, status: x.gameStatus }, now);
      const isHome = x.homeTeamId === x.r.teamId;
      const reason = x.r.cancelReason as SubCancelReason | null;
      return {
        id: x.r.id,
        gameId: x.r.gameId,
        teamId: x.r.teamId,
        teamName: x.teamName,
        personId: x.r.substitutePersonId,
        personName: personName(x),
        status,
        statusLabel: SUB_REQUEST_STATUS_LABELS[status],
        source: x.r.source,
        rosterOverride: x.r.rosterOverride,
        note: x.r.note,
        cancelReason: x.r.cancelReason,
        cancelReasonText: reason ? (SUB_CANCEL_REASONS[reason] ?? reason) : null,
        createdAt: x.r.createdAt.toISOString(),
        decidedAt: x.r.decidedAt?.toISOString() ?? null,
        attendanceId: x.r.attendanceId,
        log: Array.isArray(x.r.log) ? (x.r.log as SubLogEntry[]) : [],
        game: {
          startsAt: x.start.toISOString(),
          tz: x.tz,
          status: x.gameStatus,
          venueName: x.venueName,
          homeTeamName: x.homeTeamName ?? "Home",
          awayTeamName: x.awayTeamName ?? "Away",
          opponentName: (isHome ? x.awayTeamName : x.homeTeamName) ?? "Opponent",
          when: formatInZone(x.start, x.tz)
        }
      };
    });
  }

  private async teamView(game: GameCtx, teamId: string): Promise<TeamSubsView> {
    const division = await teamDivisionInSeason(this.db, teamId, game.seasonId);
    const [guests, requests, candidates] = await Promise.all([
      this.db
        .select({
          attendanceId: schema.gameAttendance.id,
          personId: schema.gameAttendance.personId,
          first: schema.persons.legalFirstName,
          last: schema.persons.legalLastName,
          preferred: schema.persons.preferredName
        })
        .from(schema.gameAttendance)
        .innerJoin(schema.persons, eq(schema.persons.id, schema.gameAttendance.personId))
        .where(
          and(
            eq(schema.gameAttendance.gameId, game.id),
            eq(schema.gameAttendance.teamId, teamId),
            eq(schema.gameAttendance.isGuest, true)
          )
        ),
      this.requestViews(
        this.db,
        and(eq(schema.substituteRequests.gameId, game.id), eq(schema.substituteRequests.teamId, teamId))
      ),
      this.candidatesFor(this.db, game, teamId)
    ]);
    const viaAttendance = new Map(
      requests.filter((r) => r.attendanceId).map((r) => [r.attendanceId!, r])
    );
    const teamName = teamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName;
    return {
      teamId,
      teamName,
      division: division ? { id: division.id, name: division.name, tier: division.tier } : null,
      rules: {
        maxGuestPlayersPerGame: division?.rules.maxGuestPlayersPerGame ?? 2,
        guestPlayerSeasonLimit: division?.rules.guestPlayerSeasonLimit ?? 5
      },
      guestsThisGame: guests.length,
      guests: guests.map((g) => ({
        attendanceId: g.attendanceId,
        personId: g.personId,
        name: personName(g),
        viaRequestId: viaAttendance.get(g.attendanceId)?.id ?? null,
        rosterOverride: viaAttendance.get(g.attendanceId)?.rosterOverride ?? false
      })),
      requests,
      candidates
    };
  }

  private gameSummary(game: GameCtx, teamId?: string) {
    const now = Date.now();
    return {
      id: game.id,
      startsAt: game.start.toISOString(),
      tz: game.tz,
      when: formatInZone(game.start, game.tz),
      status: game.status,
      venueName: game.venueName,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeTeamName: game.homeTeamName,
      awayTeamName: game.awayTeamName,
      opponentName: teamId ? (teamId === game.homeTeamId ? game.awayTeamName : game.homeTeamName) : null,
      started: now >= game.start.getTime()
    };
  }

  /** Why no new request can be sent for this game, or null. */
  private askClosedReason(game: GameCtx, view: TeamSubsView): string | null {
    if (Date.now() >= game.start.getTime()) return "This game has started.";
    if (!ASK_STATUSES.includes(game.status)) return `This game is ${game.status.replace(/_/g, " ")}.`;
    if (view.guestsThisGame >= view.rules.maxGuestPlayersPerGame) {
      return `Every guest spot for this game is filled (${view.rules.maxGuestPlayersPerGame}).`;
    }
    return null;
  }

  async captainView(userId: string, teamId: string, gameId: string) {
    const { game } = await this.requireCaptainGame(userId, teamId, gameId);
    const view = await this.teamView(game, teamId);
    return { game: this.gameSummary(game, teamId), ...view, closedReason: this.askClosedReason(game, view) };
  }

  async adminView(userId: string, gameId: string) {
    const game = await this.requireAdminGame(userId, gameId, { allowSeasonless: true });
    // A game outside any season (older data) can have no subs: nobody is in
    // its pool. Say so instead of answering 404 on the game page.
    if (!game.seasonId) {
      return { game: this.gameSummary(game), teams: [], assignClosedReason: "This game is not in a season, so subs cannot be added to it." };
    }
    const teams = await Promise.all([this.teamView(game, game.homeTeamId), this.teamView(game, game.awayTeamId)]);
    const assignOpen =
      ADMIN_ASSIGN_STATUSES.includes(game.status) ? null : `This game is ${game.status.replace(/_/g, " ")}, so subs can no longer be assigned.`;
    return { game: this.gameSummary(game), teams, assignClosedReason: assignOpen };
  }

  /** Open requests waiting on the caller's answer (player app). */
  async myRequests(userId: string) {
    const [me] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    if (!me) return { items: [] as SubRequestView[] };
    const rows = await this.requestViews(
      this.db,
      and(eq(schema.substituteRequests.substitutePersonId, me.id), eq(schema.substituteRequests.status, "requested"))
    );
    return { items: rows.filter((r) => r.status === "requested") };
  }

  // ===================================================================
  // Transitions
  // ===================================================================

  private notEligible(c: SubCandidateView | undefined, who: string): never {
    if (!c) {
      throw new NotFoundException({
        error: "not_in_pool",
        message: `${who} is not a free agent in this season or a player in this level, so cannot sub here.`
      });
    }
    throw new ConflictException({
      error: "not_eligible",
      message: `${c.name} cannot sub in this game: ${c.reasonText}.`,
      reasons: c.reasons
    });
  }

  /** Captain asks one player. Idempotent per player and game while open. */
  async createRequest(userId: string, teamId: string, gameId: string, body: { personId: string; note?: string }) {
    const { team, game } = await this.requireCaptainGame(userId, teamId, gameId);
    if (Date.now() >= game.start.getTime()) {
      throw new ConflictException({ error: "game_started", message: "This game has started, so no new sub can be asked." });
    }
    if (!ASK_STATUSES.includes(game.status)) {
      throw new ConflictException({ error: "game_not_open", message: `This game is ${game.status.replace(/_/g, " ")}, so no sub can be asked.` });
    }
    const note = body.note?.trim().slice(0, 500) || null;
    const result = await this.db.transaction(async (tx) => {
      await lockGameGuests(tx, game.id, teamId);
      const division = await teamDivisionInSeason(tx, teamId, game.seasonId);
      const max = division?.rules.maxGuestPlayersPerGame ?? 2;
      if ((await countGameGuests(tx, game.id, teamId)) >= max) {
        throw new ConflictException({
          error: "guest_spots_filled",
          message: `Every guest spot for this game is filled (${max}).`
        });
      }
      const [open] = await tx
        .select()
        .from(schema.substituteRequests)
        .where(
          and(
            eq(schema.substituteRequests.gameId, game.id),
            eq(schema.substituteRequests.substitutePersonId, body.personId),
            eq(schema.substituteRequests.status, "requested")
          )
        )
        .limit(1);
      if (open) {
        if (open.teamId === teamId) return { id: open.id, created: false as const };
        throw new ConflictException({
          error: "asked_by_other_team",
          message: "The other team already asked this player to sub in this game."
        });
      }
      const [cand] = await this.candidatesFor(tx, game, teamId, { personIds: [body.personId] });
      if (!cand || !cand.eligible) this.notEligible(cand, "This player");
      const [row] = await tx
        .insert(schema.substituteRequests)
        .values({
          gameId: game.id,
          teamId,
          seasonId: game.seasonId,
          substitutePersonId: body.personId,
          status: "requested",
          source: cand.source,
          note,
          requestedByUserId: userId,
          log: [logEntry("requested", userId, note ?? undefined)]
        })
        .returning({ id: schema.substituteRequests.id });
      if (!row) throw new Error(`sub request insert returned no row game=${game.id} person=${body.personId}`);
      return { id: row.id, created: true as const };
    });
    const [view] = await this.requestViews(this.db, and(eq(schema.substituteRequests.id, result.id)));
    if (!view) throw new Error(`sub request readback empty id=${result.id}`);
    this.log.log(
      `sub request ${result.created ? "created" : "already open"} id=${view.id} game=${game.id} team=${teamId} person=${view.personId} by=${userId}`
    );
    if (result.created) {
      await this.tellPerson(view.personId, "SUB_REQUEST", `sub-req-${view.id}`, game, this.payload(view, team.name));
    }
    return { request: view, created: result.created };
  }

  /** Captain withdraws an open request. */
  async cancelRequest(userId: string, teamId: string, requestId: string) {
    const [req] = await this.db
      .select({ gameId: schema.substituteRequests.gameId, teamId: schema.substituteRequests.teamId })
      .from(schema.substituteRequests)
      .where(eq(schema.substituteRequests.id, requestId))
      .limit(1);
    if (!req || req.teamId !== teamId) throw new NotFoundException("Request not found");
    const { team, game } = await this.requireCaptainGame(userId, teamId, req.gameId);
    const out = await this.db.transaction(async (tx) => {
      const row = await this.lockRequest(tx, requestId);
      const status = subRequestStatus(row.status, { start: game.start, status: game.status });
      if (row.status === "cancelled") return { changed: false, expired: false };
      if (status === "expired") {
        await this.writeExpired(tx, row);
        return { changed: false, expired: true };
      }
      if (row.status !== "requested") {
        throw new ConflictException({
          error: "not_open",
          message: `This request was already ${row.status}; it cannot be cancelled.`
        });
      }
      await this.setStatus(tx, row.id, "cancelled", userId, { cancelReason: "captain" });
      return { changed: true, expired: false };
    });
    if (out.expired) throw new ConflictException({ error: "expired", message: "This game has started; the request expired." });
    const [view] = await this.requestViews(this.db, and(eq(schema.substituteRequests.id, requestId)));
    if (out.changed && view) {
      this.log.log(`sub request cancelled id=${requestId} by captain=${userId}`);
      await this.tellPerson(view.personId, "SUB_REQUEST_CANCELLED", `sub-cancel-${view.id}`, game, {
        ...this.payload(view, team.name),
        reason: SUB_CANCEL_REASONS.captain
      });
    }
    return { request: view, changed: out.changed };
  }

  /** The asked player accepts or declines. 404 unless the request is theirs. */
  async answer(userId: string, requestId: string, answer: "accept" | "decline") {
    const [req] = await this.db
      .select({ r: schema.substituteRequests, userId: schema.persons.userId })
      .from(schema.substituteRequests)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.substituteRequests.substitutePersonId))
      .where(eq(schema.substituteRequests.id, requestId))
      .limit(1);
    if (!req || req.userId !== userId) {
      this.log.warn(`sub answer refused user=${userId} request=${requestId}: not theirs`);
      throw new NotFoundException("Request not found");
    }
    const game = await this.loadGame(req.r.gameId);
    if (!game) throw new NotFoundException("Game not found");

    const out = await this.db.transaction(async (tx) => {
      if (answer === "accept") await lockGameGuests(tx, game.id, req.r.teamId);
      const row = await this.lockRequest(tx, requestId);
      const want = answer === "accept" ? "accepted" : "declined";
      if (row.status === want) return { kind: "same" as const };
      if (row.status !== "requested") {
        throw new ConflictException({
          error: "not_open",
          message:
            row.status === "cancelled"
              ? "The captain cancelled this request."
              : row.status === "accepted"
                ? "You already accepted this request."
                : row.status === "declined"
                  ? "You already declined this request."
                  : "This request has expired."
        });
      }
      if (subRequestStatus(row.status, { start: game.start, status: game.status }) === "expired") {
        await this.writeExpired(tx, row);
        return { kind: "expired" as const };
      }
      if (answer === "decline") {
        await this.setStatus(tx, row.id, "declined", userId);
        return { kind: "declined" as const };
      }
      if (!ASK_STATUSES.includes(game.status)) {
        throw new ConflictException({
          error: "game_not_open",
          message: `This game is ${game.status.replace(/_/g, " ")}. Wait for the league to set it again.`
        });
      }
      // Re-check eligibility now: a suspension, a clash or the season
      // guest limit may have arrived since the captain asked.
      const [cand] = await this.candidatesFor(tx, game, row.teamId, { personIds: [row.substitutePersonId] });
      if (!cand || !cand.eligible) this.notEligible(cand, "You");
      const added = await addGameGuest(tx, {
        teamId: row.teamId,
        seasonId: row.seasonId,
        gameId: row.gameId,
        personId: row.substitutePersonId,
        actorUserId: userId,
        moveMetadata: { subRequestId: row.id }
      });
      await this.setStatus(tx, row.id, "accepted", userId, { attendanceId: added.attendance.id });
      const closed =
        added.guestsThisGame >= added.maxGuestPlayersPerGame
          ? await this.cancelOpenForTeam(tx, row.gameId, row.teamId, row.id, "guest_spots_filled")
          : [];
      return { kind: "accepted" as const, attendanceId: added.attendance.id, closed };
    });

    if (out.kind === "expired") {
      throw new ConflictException({ error: "expired", message: "This game has started; the request expired." });
    }
    const [view] = await this.requestViews(this.db, and(eq(schema.substituteRequests.id, requestId)));
    if (!view) throw new Error(`sub request readback empty id=${requestId}`);
    if (out.kind === "same") return { request: view, changed: false };

    this.log.log(`sub request ${view.status} id=${view.id} game=${view.gameId} team=${view.teamId} person=${view.personId}`);
    const payload = this.payload(view, view.teamName);
    await this.tellRequester(req.r.requestedByUserId, view.status === "accepted" ? "SUB_REQUEST_ACCEPTED" : "SUB_REQUEST_DECLINED", `sub-${view.status}-${view.id}`, game, payload);
    if (out.kind === "accepted") {
      await notifyAudience(this.db, this.notify, {
        orgId: game.orgId,
        target: { leagueIds: [game.leagueId], seasonIds: [game.seasonId] },
        audiences: ["all_admins"],
        templateCode: "SUB_ADDED_ADMIN",
        key: `sub-added-admin-${view.id}`,
        payload: { ...payload, how: "accepted the captain's request" }
      });
      await this.tellClosed(out.closed, game);
    }
    return { request: view, changed: true };
  }

  /** League admin puts a sub on the game directly (UC-31 alternative flow). */
  async adminAssign(userId: string, gameId: string, body: { teamId: string; personId: string; note?: string }) {
    const game = await this.requireAdminGame(userId, gameId);
    if (body.teamId !== game.homeTeamId && body.teamId !== game.awayTeamId) {
      throw new NotFoundException("Team not found in this game");
    }
    if (!ADMIN_ASSIGN_STATUSES.includes(game.status)) {
      throw new ConflictException({ error: "game_not_open", message: `This game is ${game.status.replace(/_/g, " ")}.` });
    }
    const note = body.note?.trim().slice(0, 500) || null;
    const out = await this.db.transaction(async (tx) => {
      await lockGameGuests(tx, game.id, body.teamId);
      // A second click: the guest is there through an assignment already.
      const [done] = await tx
        .select({ id: schema.substituteRequests.id })
        .from(schema.substituteRequests)
        .innerJoin(schema.gameAttendance, eq(schema.gameAttendance.id, schema.substituteRequests.attendanceId))
        .where(
          and(
            eq(schema.substituteRequests.gameId, game.id),
            eq(schema.substituteRequests.teamId, body.teamId),
            eq(schema.substituteRequests.substitutePersonId, body.personId),
            eq(schema.substituteRequests.status, "accepted")
          )
        )
        .limit(1);
      if (done) return { id: done.id, created: false as const, closed: [] as string[], cancelledOther: null as string | null };
      const [cand] = await this.candidatesFor(tx, game, body.teamId, { personIds: [body.personId] });
      if (!cand) this.notEligible(cand, "This player");
      if (!cand.adminOverridable) {
        throw new ConflictException({
          error: "not_eligible",
          message: `${cand.name} cannot sub in this game, even with an override: ${cand.reasonText}.`,
          reasons: cand.reasons
        });
      }
      const added = await addGameGuest(tx, {
        teamId: body.teamId,
        seasonId: game.seasonId,
        gameId: game.id,
        personId: body.personId,
        actorUserId: userId,
        moveMetadata: { rosterOverride: true, overriddenReasons: cand.reasons }
      });
      const overrideNote = [note, cand.reasons.length ? `Override: ${cand.reasonText}` : null].filter(Boolean).join(". ") || undefined;
      const [open] = await tx
        .select()
        .from(schema.substituteRequests)
        .where(
          and(
            eq(schema.substituteRequests.gameId, game.id),
            eq(schema.substituteRequests.substitutePersonId, body.personId),
            eq(schema.substituteRequests.status, "requested")
          )
        )
        .limit(1)
        .for("update");
      let id: string;
      let cancelledOther: string | null = null;
      if (open && open.teamId === body.teamId) {
        await this.setStatus(tx, open.id, "accepted", userId, { attendanceId: added.attendance.id, rosterOverride: true, note: overrideNote ?? "Assigned by a league admin" });
        id = open.id;
      } else {
        if (open) {
          await this.setStatus(tx, open.id, "cancelled", userId, { cancelReason: "player_added_elsewhere" });
          cancelledOther = open.id;
        }
        const [row] = await tx
          .insert(schema.substituteRequests)
          .values({
            gameId: game.id,
            teamId: body.teamId,
            seasonId: game.seasonId,
            substitutePersonId: body.personId,
            status: "accepted",
            source: cand.source,
            rosterOverride: true,
            note,
            requestedByUserId: userId,
            decidedByUserId: userId,
            decidedAt: new Date(),
            attendanceId: added.attendance.id,
            log: [logEntry("accepted", userId, overrideNote ?? "Assigned by a league admin")]
          })
          .returning({ id: schema.substituteRequests.id });
        if (!row) throw new Error(`sub assignment insert returned no row game=${game.id} person=${body.personId}`);
        id = row.id;
      }
      const closed =
        added.guestsThisGame >= added.maxGuestPlayersPerGame
          ? await this.cancelOpenForTeam(tx, game.id, body.teamId, id, "guest_spots_filled")
          : [];
      return { id, created: true as const, closed, cancelledOther };
    });
    const [view] = await this.requestViews(this.db, and(eq(schema.substituteRequests.id, out.id)));
    if (!view) throw new Error(`sub assignment readback empty id=${out.id}`);
    if (!out.created) return { request: view, created: false };
    this.log.log(`sub assigned by admin id=${view.id} game=${game.id} team=${body.teamId} person=${body.personId} by=${userId}`);
    const payload = this.payload(view, view.teamName);
    await this.tellPerson(view.personId, "SUB_ASSIGNED", `sub-assigned-${view.id}`, game, payload);
    await notifyAudience(this.db, this.notify, {
      orgId: game.orgId,
      target: { teamIds: [body.teamId] },
      audiences: ["captains"],
      templateCode: "SUB_ASSIGNED_CAPTAIN",
      key: `sub-assigned-captain-${view.id}`,
      excludePersonIds: [view.personId],
      payload
    });
    await this.tellClosed([...out.closed, ...(out.cancelledOther ? [out.cancelledOther] : [])], game);
    return { request: view, created: true };
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  private async lockRequest(tx: Tx, id: string): Promise<RequestRow> {
    const [row] = await tx
      .select()
      .from(schema.substituteRequests)
      .where(eq(schema.substituteRequests.id, id))
      .limit(1)
      .for("update");
    if (!row) throw new NotFoundException("Request not found");
    return row;
  }

  private async setStatus(
    tx: Tx,
    id: string,
    status: SubRequestStatus,
    byUserId: string | null,
    extra: { cancelReason?: SubCancelReason; attendanceId?: string; rosterOverride?: boolean; note?: string } = {}
  ): Promise<void> {
    const now = new Date();
    const note = extra.cancelReason ? SUB_CANCEL_REASONS[extra.cancelReason] : extra.note;
    const rows = await tx
      .update(schema.substituteRequests)
      .set({
        status,
        decidedAt: now,
        decidedByUserId: byUserId,
        updatedAt: now,
        log: appendLog(logEntry(status, byUserId, note)),
        ...(extra.cancelReason ? { cancelReason: extra.cancelReason } : {}),
        ...(extra.attendanceId ? { attendanceId: extra.attendanceId } : {}),
        ...(extra.rosterOverride ? { rosterOverride: true } : {})
      })
      .where(and(eq(schema.substituteRequests.id, id), eq(schema.substituteRequests.status, "requested")))
      .returning({ id: schema.substituteRequests.id });
    if (rows.length !== 1) {
      throw new ConflictException({ error: "not_open", message: "This request is no longer open." });
    }
  }

  private async writeExpired(tx: Tx, row: RequestRow): Promise<void> {
    await tx
      .update(schema.substituteRequests)
      .set({ status: "expired", updatedAt: new Date(), log: appendLog(logEntry("expired", null, "The game started")) })
      .where(and(eq(schema.substituteRequests.id, row.id), eq(schema.substituteRequests.status, "requested")));
    this.log.log(`sub request expired id=${row.id} game=${row.gameId}`);
  }

  /** Cancel the team's other open requests for the game (e.g. the guest spots filled). */
  private async cancelOpenForTeam(tx: Tx, gameId: string, teamId: string, keepId: string, reason: SubCancelReason): Promise<string[]> {
    const rows = await tx
      .update(schema.substituteRequests)
      .set({
        status: "cancelled",
        cancelReason: reason,
        decidedAt: new Date(),
        updatedAt: new Date(),
        log: appendLog(logEntry("cancelled", null, SUB_CANCEL_REASONS[reason]))
      })
      .where(
        and(
          eq(schema.substituteRequests.gameId, gameId),
          eq(schema.substituteRequests.teamId, teamId),
          eq(schema.substituteRequests.status, "requested"),
          ne(schema.substituteRequests.id, keepId)
        )
      )
      .returning({ id: schema.substituteRequests.id });
    if (rows.length) this.log.log(`sub requests closed game=${gameId} team=${teamId} reason=${reason} n=${rows.length}`);
    return rows.map((r) => r.id);
  }

  private payload(view: SubRequestView, teamName: string) {
    return {
      gameId: view.gameId,
      requestId: view.id,
      teamName,
      playerName: view.personName,
      opponentName: view.game.opponentName,
      gameWhen: `${view.game.when}${view.game.venueName ? ` at ${view.game.venueName}` : ""}`,
      playerAppUrl: playerWebUrl(this.config),
      note: view.note ? `Note from the captain: ${view.note}` : ""
    };
  }

  private async tellPerson(personId: string, code: TemplateCode, key: string, game: GameCtx, payload: Record<string, unknown>) {
    for (const channel of ["email", "in_app"] as const) {
      void this.notify.queue({
        orgId: game.orgId,
        templateCode: code,
        channel,
        idempotencyKey: `${key}-${channel}`,
        recipientPersonId: personId,
        payload: { ...payload, seasonId: game.seasonId }
      });
    }
  }

  private async tellRequester(requestedByUserId: string | null, code: TemplateCode, key: string, game: GameCtx, payload: Record<string, unknown>) {
    if (!requestedByUserId) {
      this.log.warn(`${code} ${key}: no requester to tell`);
      return;
    }
    const [p] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, requestedByUserId))
      .limit(1);
    if (!p) {
      this.log.warn(`${code} ${key}: requester ${requestedByUserId} has no person`);
      return;
    }
    await this.tellPerson(p.id, code, key, game, payload);
  }

  private async tellClosed(ids: string[], game: GameCtx) {
    if (ids.length === 0) return;
    const views = await this.requestViews(this.db, and(inArray(schema.substituteRequests.id, ids)));
    for (const v of views) {
      await this.tellPerson(v.personId, "SUB_REQUEST_CANCELLED", `sub-cancel-${v.id}`, game, {
        ...this.payload(v, v.teamName),
        reason: v.cancelReasonText ?? "The request was closed"
      });
    }
  }
}

