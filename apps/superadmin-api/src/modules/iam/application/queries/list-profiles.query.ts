import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { clampLimit, type Page, type QueryHandler } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { ProfileDto, ProfilePageDto } from "../dtos/profile.dto";

export interface ListProfilesInput {
  limit?: number;
  cursor?: string;
  status?: "pending" | "active" | "suspended" | "deleted";
  search?: string;
  countryCode?: string;
  isSuperAdmin?: boolean;
  roleCode?: string;
}

@Injectable()
export class ListProfilesHandler
  implements QueryHandler<ListProfilesInput, ProfilePageDto>
{
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /**
   * Region names per user, one query for the whole page. A user reaches
   * a region through: a division-scoped role, a team-scoped role whose
   * team has a live entry in a division, or an active roster membership
   * (person -> team -> live entry -> division). Only divisions with a
   * region count.
   */
  private async regionsByUser(userIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (userIds.length === 0) return out;
    const rows = await this.db.execute<{ user_id: string; names: string[] }>(sql`
      WITH live_entries AS (
        SELECT dte.team_id, d.region_id
        FROM division_team_entries dte
        JOIN divisions d ON d.id = dte.division_id
        WHERE dte.entry_status NOT IN ('rejected','withdrawn','disqualified')
          AND d.region_id IS NOT NULL
      ),
      reach AS (
        SELECT ura.user_id, d.region_id
        FROM user_role_assignments ura
        JOIN divisions d ON d.id = ura.scope_id
        WHERE ura.scope_type = 'division' AND ura.revoked_at IS NULL
          AND d.region_id IS NOT NULL
        UNION
        SELECT ura.user_id, le.region_id
        FROM user_role_assignments ura
        JOIN live_entries le ON le.team_id = ura.scope_id
        WHERE ura.scope_type = 'team' AND ura.revoked_at IS NULL
        UNION
        SELECT p.user_id, le.region_id
        FROM persons p
        JOIN team_memberships tm ON tm.person_id = p.id AND tm.current_status = 'active'
        JOIN live_entries le ON le.team_id = tm.team_id
        WHERE p.user_id IS NOT NULL
      )
      SELECT r.user_id, array_agg(DISTINCT rg.name ORDER BY rg.name) AS names
      FROM reach r
      JOIN regions rg ON rg.id = r.region_id
      WHERE r.user_id IN (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})
      GROUP BY r.user_id
    `);
    for (const r of rows as unknown as Array<{ user_id: string; names: string[] }>) {
      out.set(r.user_id, r.names);
    }
    return out;
  }

  async execute(input: ListProfilesInput): Promise<ProfilePageDto> {
    const page: Page<import("../../domain/entities/profile.entity").Profile> =
      await this.profiles.list({
        limit: clampLimit(input.limit),
        cursor: input.cursor,
        status: input.status,
        search: input.search,
        countryCode: input.countryCode,
        isSuperAdmin: input.isSuperAdmin,
        roleCode: input.roleCode
      });
    const items = page.items.map(ProfileDto.fromDomain);
    const regions = await this.regionsByUser(items.map((u) => u.id));
    return {
      items: items.map((u) => ({ ...u, regions: regions.get(u.id) ?? [] })),
      nextCursor: page.nextCursor
    };
  }
}
