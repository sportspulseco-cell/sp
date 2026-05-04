import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { OrgRelation } from "../../domain/entities/org-relation.entity";
import { OrgId, OrgRelationId } from "../../domain/identifiers";
import type { OrgRelationRepository } from "../../domain/repositories/org-relation.repository";

@Injectable()
export class DrizzleOrgRelationRepository implements OrgRelationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: OrgRelationId): Promise<OrgRelation | null> {
    const [row] = await this.db
      .select()
      .from(schema.orgRelations)
      .where(eq(schema.orgRelations.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByEdge(parent: OrgId, child: OrgId, relation: string): Promise<OrgRelation | null> {
    const [row] = await this.db
      .select()
      .from(schema.orgRelations)
      .where(
        and(
          eq(schema.orgRelations.parentOrgId, parent.value),
          eq(schema.orgRelations.childOrgId, child.value),
          eq(schema.orgRelations.relation, relation),
          isNull(schema.orgRelations.effectiveTo)
        )
      )
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listChildren(parent: OrgId): Promise<OrgRelation[]> {
    const rows = await this.db
      .select()
      .from(schema.orgRelations)
      .where(eq(schema.orgRelations.parentOrgId, parent.value));
    return rows.map((r) => this.toDomain(r));
  }

  async listParents(child: OrgId): Promise<OrgRelation[]> {
    const rows = await this.db
      .select()
      .from(schema.orgRelations)
      .where(eq(schema.orgRelations.childOrgId, child.value));
    return rows.map((r) => this.toDomain(r));
  }

  async insert(r: OrgRelation): Promise<void> {
    const x = r.toSnapshot();
    await this.db.insert(schema.orgRelations).values({
      id: x.id,
      parentOrgId: x.parentOrgId,
      childOrgId: x.childOrgId,
      relation: x.relation,
      effectiveFrom: x.effectiveFrom,
      effectiveTo: x.effectiveTo
    });
  }

  async save(r: OrgRelation): Promise<void> {
    const x = r.toSnapshot();
    await this.db
      .update(schema.orgRelations)
      .set({ effectiveTo: x.effectiveTo })
      .where(eq(schema.orgRelations.id, x.id));
  }

  private toDomain(r: typeof schema.orgRelations.$inferSelect): OrgRelation {
    return OrgRelation.rehydrate({
      id: r.id,
      parentOrgId: r.parentOrgId,
      childOrgId: r.childOrgId,
      relation: r.relation as never,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      createdAt: r.createdAt
    });
  }
}
