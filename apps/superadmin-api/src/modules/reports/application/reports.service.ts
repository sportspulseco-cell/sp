import { Inject, Injectable } from "@nestjs/common";
import { STATS_REPOSITORY, type StatsRepository } from "../../stats/domain/repositories/stats.repository";
import {
  TEAM_MEMBERSHIP_REPOSITORY,
  type TeamMembershipRepository
} from "../../roster-membership/domain/repositories/team-membership.repository";
import {
  REGISTRATION_REPOSITORY,
  type RegistrationRepository
} from "../../registration-compliance/domain/repositories/registration.repository";
import { toCsv } from "./csv";

@Injectable()
export class ReportsService {
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository,
    @Inject(TEAM_MEMBERSHIP_REPOSITORY)
    private readonly memberships: TeamMembershipRepository,
    @Inject(REGISTRATION_REPOSITORY)
    private readonly registrations: RegistrationRepository
  ) {}

  /** Standings for a league as CSV. */
  async standings(leagueId: string, divisionId?: string): Promise<string> {
    const rows = await this.stats.listStandings(leagueId, divisionId);
    const out = rows.map((r) => ({
      rank: r.rank ?? "",
      team_id: r.teamId,
      gp: r.gp,
      w: r.w,
      l: r.l,
      t: r.t,
      otl: r.otl,
      gf: r.gf,
      ga: r.ga,
      gd: r.gd,
      points: r.points
    }));
    return toCsv(out, [
      "rank",
      "team_id",
      "gp",
      "w",
      "l",
      "t",
      "otl",
      "gf",
      "ga",
      "gd",
      "points"
    ]);
  }

  /** Active memberships for a season (or team) as CSV. */
  async rosters(opts: {
    seasonId?: string;
    teamId?: string;
  }): Promise<string> {
    const page = await this.memberships.list({
      ...opts,
      activeOnly: true,
      limit: 1000
    });
    const out = page.items.map((entity) => {
      const m = entity.toSnapshot();
      return {
        team_id: m.teamId,
        person_id: m.personId,
        season_id: m.seasonId,
        jersey: m.jerseyNumber ?? "",
        position: m.positionCode ?? "",
        type: m.membershipType,
        status: m.currentStatus,
        from: m.effectiveFrom.toISOString()
      };
    });
    return toCsv(out, [
      "team_id",
      "person_id",
      "season_id",
      "jersey",
      "position",
      "type",
      "status",
      "from"
    ]);
  }

  /** Registrations as CSV — orgId / status / leagueId filters. */
  async registrationsCsv(opts: {
    orgId?: string;
    leagueId?: string;
    status?: string;
  }): Promise<string> {
    const page = await this.registrations.list({ ...opts, limit: 1000 });
    const out = page.items.map((r) => {
      const x = r.toSnapshot();
      return {
        id: x.id,
        org_id: x.orgId,
        league_id: x.leagueId ?? "",
        division_id: x.divisionId ?? "",
        team_id: x.teamId ?? "",
        subject_person_id: x.subjectPersonId,
        status: x.status,
        submitted_at: x.submittedAt?.toISOString() ?? "",
        reviewed_at: x.reviewedAt?.toISOString() ?? "",
        decision_reason: x.decisionReason ?? "",
        created_at: x.createdAt.toISOString()
      };
    });
    return toCsv(out, [
      "id",
      "org_id",
      "league_id",
      "division_id",
      "team_id",
      "subject_person_id",
      "status",
      "submitted_at",
      "reviewed_at",
      "decision_reason",
      "created_at"
    ]);
  }
}
