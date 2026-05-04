import { Inject, Injectable } from "@nestjs/common";
import { eq, or } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { CrossOrgGrant } from "../../domain/entities/cross-org-grant.entity";
import { CrossOrgGrantId, OrgId } from "../../domain/identifiers";
import type { CrossOrgGrantRepository } from "../../domain/repositories/cross-org-grant.repository";

@Injectable()
export class DrizzleCrossOrgGrantRepository
  implements CrossOrgGrantRepository
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: CrossOrgGrantId): Promise<CrossOrgGrant | null> {
    const [row] = await this.db
      .select()
      .from(schema.crossOrgGrants)
      .where(eq(schema.crossOrgGrants.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listByUser(userId: string): Promise<CrossOrgGrant[]> {
    const rows = await this.db
      .select()
      .from(schema.crossOrgGrants)
      .where(eq(schema.crossOrgGrants.userId, userId));
    return rows.map((r) => this.toDomain(r));
  }

  async listByOrg(orgId: OrgId): Promise<CrossOrgGrant[]> {
    const rows = await this.db
      .select()
      .from(schema.crossOrgGrants)
      .where(
        or(
          eq(schema.crossOrgGrants.fromOrgId, orgId.value),
          eq(schema.crossOrgGrants.toOrgId, orgId.value)
        )
      );
    return rows.map((r) => this.toDomain(r));
  }

  async insert(g: CrossOrgGrant): Promise<void> {
    const x = g.toSnapshot();
    await this.db.insert(schema.crossOrgGrants).values({
      id: x.id,
      userId: x.userId,
      fromOrgId: x.fromOrgId,
      toOrgId: x.toOrgId,
      permissions: x.permissions,
      effectiveFrom: x.effectiveFrom,
      effectiveTo: x.effectiveTo,
      grantedByUserId: x.grantedByUserId
    });
  }

  async save(g: CrossOrgGrant): Promise<void> {
    const x = g.toSnapshot();
    await this.db
      .update(schema.crossOrgGrants)
      .set({ permissions: x.permissions, effectiveTo: x.effectiveTo })
      .where(eq(schema.crossOrgGrants.id, x.id));
  }

  private toDomain(r: typeof schema.crossOrgGrants.$inferSelect): CrossOrgGrant {
    return CrossOrgGrant.rehydrate({
      id: r.id,
      userId: r.userId,
      fromOrgId: r.fromOrgId,
      toOrgId: r.toOrgId,
      permissions: r.permissions as string[],
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      grantedByUserId: r.grantedByUserId,
      createdAt: r.createdAt
    });
  }
}
