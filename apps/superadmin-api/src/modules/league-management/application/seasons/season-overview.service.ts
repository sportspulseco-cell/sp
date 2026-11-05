import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";
import { NotFoundError, type SeasonOverview } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { accessCan, accessForAnyScope } from "../../../../shared/auth/game-access";
import { ADMIN_SCOPE_ROLE_CODES } from "../../../../shared/auth/scope";
import { seasonRegistrationFormMatch } from "../../../registration-v2/application/registration-requirements.service";

@Injectable()
export class SeasonOverviewService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  async execute(seasonId: string, userId: string): Promise<SeasonOverview> {
    const [season] = await this.db.select().from(schema.seasons)
      .where(and(eq(schema.seasons.id, seasonId), isNull(schema.seasons.deletedAt))).limit(1);
    if (!season) throw new NotFoundError("Season", seasonId);
    const access = await accessForAnyScope(this.db, userId, [{ id: "", orgId: season.orgId,
      leagueId: season.leagueId, seasonId, divisionId: null, homeTeamId: "", awayTeamId: "" }], ADMIN_SCOPE_ROLE_CODES);
    if (!accessCan(access, "season.read")) throw new NotFoundError("Season", seasonId);
    // Count in the database rather than transferring paginated participant
    // histories. Every count shares one authorized, bounded statement.
    const [row] = await this.db.execute(sql`WITH ds AS (
      SELECT id FROM divisions WHERE season_id=${seasonId}::uuid AND deleted_at IS NULL
    ), gs AS (
      SELECT scheduled_start_ts_utc, tz, status FROM games WHERE division_id IN (SELECT id FROM ds)
    ) SELECT
      (SELECT count(*)::int FROM ds) AS divisions,
      (SELECT count(*)::int FROM registrations WHERE season_id=${seasonId}::uuid) AS registrations,
      (SELECT count(*)::int FROM registrations WHERE season_id=${seasonId}::uuid AND status IN ('pending_review','pending_offline')) AS waiting,
      (SELECT count(*)::int FROM division_team_entries WHERE division_id IN (SELECT id FROM ds) AND left_at IS NULL AND entry_status='pending_approval') AS pending_teams,
      (SELECT count(DISTINCT team_id)::int FROM division_team_entries WHERE division_id IN (SELECT id FROM ds) AND left_at IS NULL AND entry_status IN ('applied','accepted','confirmed')) AS placed_teams,
      (SELECT count(DISTINCT person_id)::int FROM team_memberships WHERE season_id=${seasonId}::uuid AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now()) AND current_status<>'released') AS players,
      (SELECT count(*)::int FROM gs) AS games,
      (SELECT count(*)::int FROM gs WHERE status IN ('completed','forfeited')) AS final_games,
      EXISTS (SELECT 1 FROM registration_forms WHERE ${seasonRegistrationFormMatch(season)}) AS published_form,
      (SELECT jsonb_build_object('startsAt',scheduled_start_ts_utc,'timezone',tz) FROM gs WHERE status='scheduled' AND scheduled_start_ts_utc>=now() ORDER BY scheduled_start_ts_utc LIMIT 1) AS next_game`);
    return { seasonId, divisions: Number(row!.divisions), registrations: Number(row!.registrations),
      waitingRegistrations: Number(row!.waiting), pendingTeamApplications: Number(row!.pending_teams),
      placedTeams: Number(row!.placed_teams), players: Number(row!.players), games: Number(row!.games),
      finalGames: Number(row!.final_games), publishedForm: row!.published_form === true,
      nextGame: row!.next_game as SeasonOverview["nextGame"] };
  }
}
