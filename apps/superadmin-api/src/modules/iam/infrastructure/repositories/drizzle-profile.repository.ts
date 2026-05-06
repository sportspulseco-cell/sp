import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Profile } from "../../domain/entities/profile.entity";
import { UserId } from "../../domain/identifiers";
import type {
  ListProfilesQuery,
  ProfileRepository
} from "../../domain/repositories/profile.repository";
import { assertProfileStatus } from "../../domain/value-objects/profile-status.vo";

@Injectable()
export class DrizzleProfileRepository implements ProfileRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: UserId): Promise<Profile | null> {
    const [row] = await this.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<Profile | null> {
    const [row] = await this.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.email, email.toLowerCase()))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListProfilesQuery): Promise<Page<Profile>> {
    const conditions = [];
    if (q.status) conditions.push(eq(schema.profiles.status, q.status));
    if (q.countryCode)
      conditions.push(eq(schema.profiles.countryCode, q.countryCode));
    if (q.isSuperAdmin !== undefined)
      conditions.push(eq(schema.profiles.isSuperAdmin, q.isSuperAdmin));
    if (q.search) {
      const like = `%${q.search}%`;
      conditions.push(
        or(
          ilike(schema.profiles.email, like),
          ilike(schema.profiles.displayName, like),
          ilike(schema.profiles.legalFirstName, like),
          ilike(schema.profiles.legalLastName, like)
        )!
      );
    }
    if (q.cursor) conditions.push(gt(schema.profiles.id, q.cursor));

    // roleCode filter: subquery to user_role_assignments INNER JOIN roles,
    // limited to active assignments (revoked_at IS NULL).
    if (q.roleCode) {
      const userIdsWithRole = await this.db
        .select({ userId: schema.userRoleAssignments.userId })
        .from(schema.userRoleAssignments)
        .innerJoin(
          schema.roles,
          eq(schema.roles.id, schema.userRoleAssignments.roleId)
        )
        .where(
          and(
            eq(schema.roles.code, q.roleCode),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );
      const ids = Array.from(new Set(userIdsWithRole.map((r) => r.userId)));
      if (ids.length === 0) {
        return { items: [], nextCursor: null };
      }
      conditions.push(inArray(schema.profiles.id, ids));
    }

    const rows = await this.db
      .select()
      .from(schema.profiles)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(schema.profiles.id)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;

    return { items, nextCursor };
  }

  async save(profile: Profile): Promise<void> {
    const s = profile.toSnapshot();
    await this.db
      .update(schema.profiles)
      .set({
        legalFirstName: s.legalFirstName,
        legalLastName: s.legalLastName,
        preferredName: s.preferredName,
        displayName: s.displayName,
        locale: s.locale,
        timezone: s.timezone,
        status: s.status,
        isSuperAdmin: s.isSuperAdmin,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.profiles.id, s.id));
  }

  // -------- mapping --------
  private toDomain(row: typeof schema.profiles.$inferSelect): Profile {
    return Profile.rehydrate({
      id: row.id,
      email: row.email,
      legalFirstName: row.legalFirstName,
      legalLastName: row.legalLastName,
      preferredName: row.preferredName,
      displayName: row.displayName,
      countryCode: row.countryCode,
      locale: row.locale,
      timezone: row.timezone,
      status: assertProfileStatus(row.status),
      isSuperAdmin: row.isSuperAdmin,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    });
  }
}
