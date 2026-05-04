import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  AssignRoleInput,
  CreateRoleInput,
  ListRoleAssignmentsQuery,
  ListRolesQuery,
  RoleAssignmentRow,
  RoleRepository,
  RoleRow,
  RoleScopeType,
  UpdateRoleInput
} from "../../domain/repositories/role.repository";

@Injectable()
export class DrizzleRoleRepository implements RoleRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------- Roles ----------

  async listRoles(q: ListRolesQuery): Promise<Page<RoleRow>> {
    const cs = [];
    if (q.orgId === null) cs.push(isNull(schema.roles.orgId));
    else if (q.orgId) cs.push(eq(schema.roles.orgId, q.orgId));
    if (q.isSystem !== undefined) cs.push(eq(schema.roles.isSystem, q.isSystem));
    if (q.search) {
      cs.push(
        or(
          ilike(schema.roles.code, `%${q.search}%`),
          ilike(schema.roles.name, `%${q.search}%`)
        )!
      );
    }
    if (q.cursor) cs.push(gt(schema.roles.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.roles)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.roles.code))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toRole(r)
    );
    return { items, nextCursor: hasMore ? rows[q.limit - 1]!.id : null };
  }

  async findRole(id: string): Promise<RoleRow | null> {
    const [r] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, id));
    return r ? this.toRole(r) : null;
  }

  async findRoleByCode(
    orgId: string | null,
    code: string
  ): Promise<RoleRow | null> {
    const [r] = await this.db
      .select()
      .from(schema.roles)
      .where(
        and(
          orgId === null
            ? isNull(schema.roles.orgId)
            : eq(schema.roles.orgId, orgId),
          eq(schema.roles.code, code)
        )
      );
    return r ? this.toRole(r) : null;
  }

  async createRole(input: CreateRoleInput): Promise<RoleRow> {
    const [r] = await this.db
      .insert(schema.roles)
      .values({
        orgId: input.orgId ?? null,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        isSystem: input.isSystem ?? false,
        permissions: input.permissions ?? []
      })
      .returning();
    return this.toRole(r!);
  }

  async updateRole(input: UpdateRoleInput): Promise<RoleRow> {
    const updates: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined)
      updates.description = input.description;
    if (input.permissions !== undefined)
      updates.permissions = input.permissions;
    await this.db
      .update(schema.roles)
      .set(updates as never)
      .where(eq(schema.roles.id, input.id));
    const found = await this.findRole(input.id);
    if (!found) throw new Error("role not found");
    return found;
  }

  async deleteRole(id: string): Promise<void> {
    await this.db.delete(schema.roles).where(eq(schema.roles.id, id));
  }

  // ---------- Role assignments ----------

  async listAssignments(
    q: ListRoleAssignmentsQuery
  ): Promise<Page<RoleAssignmentRow>> {
    const cs = [];
    if (q.userId)
      cs.push(eq(schema.userRoleAssignments.userId, q.userId));
    if (q.roleId)
      cs.push(eq(schema.userRoleAssignments.roleId, q.roleId));
    if (q.scopeType)
      cs.push(eq(schema.userRoleAssignments.scopeType, q.scopeType));
    if (q.scopeId)
      cs.push(eq(schema.userRoleAssignments.scopeId, q.scopeId));
    if (q.activeOnly) cs.push(isNull(schema.userRoleAssignments.revokedAt));
    if (q.cursor) cs.push(gt(schema.userRoleAssignments.id, q.cursor));

    const rows = await this.db
      .select({
        a: schema.userRoleAssignments,
        r: schema.roles
      })
      .from(schema.userRoleAssignments)
      .leftJoin(
        schema.roles,
        eq(schema.userRoleAssignments.roleId, schema.roles.id)
      )
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(desc(schema.userRoleAssignments.createdAt))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((row) =>
      this.toAssignment(row.a, row.r)
    );
    return {
      items,
      nextCursor: hasMore ? rows[q.limit - 1]!.a.id : null
    };
  }

  async findAssignment(id: string): Promise<RoleAssignmentRow | null> {
    const [row] = await this.db
      .select({
        a: schema.userRoleAssignments,
        r: schema.roles
      })
      .from(schema.userRoleAssignments)
      .leftJoin(
        schema.roles,
        eq(schema.userRoleAssignments.roleId, schema.roles.id)
      )
      .where(eq(schema.userRoleAssignments.id, id));
    return row ? this.toAssignment(row.a, row.r) : null;
  }

  async assignRole(input: AssignRoleInput): Promise<RoleAssignmentRow> {
    // Idempotency: if an active assignment already exists for the same
    // (user, role, scopeType, scopeId), return that row instead of inserting.
    const existingCs = [
      eq(schema.userRoleAssignments.userId, input.userId),
      eq(schema.userRoleAssignments.roleId, input.roleId),
      eq(schema.userRoleAssignments.scopeType, input.scopeType),
      isNull(schema.userRoleAssignments.revokedAt)
    ];
    if (input.scopeId)
      existingCs.push(
        eq(schema.userRoleAssignments.scopeId, input.scopeId)
      );
    else existingCs.push(isNull(schema.userRoleAssignments.scopeId));

    const [existing] = await this.db
      .select()
      .from(schema.userRoleAssignments)
      .where(and(...existingCs));
    if (existing) {
      const [r] = await this.db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.id, existing.roleId));
      return this.toAssignment(existing, r ?? null);
    }

    const [row] = await this.db
      .insert(schema.userRoleAssignments)
      .values({
        userId: input.userId,
        roleId: input.roleId,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        effectiveFrom: input.effectiveFrom ?? new Date(),
        effectiveTo: input.effectiveTo ?? null,
        grantedByUserId: input.grantedByUserId ?? null,
        metadata: input.metadata ?? {}
      })
      .returning();
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, row!.roleId));
    return this.toAssignment(row!, role ?? null);
  }

  async revokeAssignment(
    id: string,
    revokedByUserId?: string | null
  ): Promise<RoleAssignmentRow> {
    await this.db
      .update(schema.userRoleAssignments)
      .set({
        revokedAt: sql`NOW()`,
        revokedByUserId: revokedByUserId ?? null
      })
      .where(eq(schema.userRoleAssignments.id, id));
    const found = await this.findAssignment(id);
    if (!found) throw new Error("assignment not found");
    return found;
  }

  async activeAssignmentsForUser(
    userId: string
  ): Promise<RoleAssignmentRow[]> {
    const rows = await this.db
      .select({
        a: schema.userRoleAssignments,
        r: schema.roles
      })
      .from(schema.userRoleAssignments)
      .leftJoin(
        schema.roles,
        eq(schema.userRoleAssignments.roleId, schema.roles.id)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, userId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      )
      .orderBy(desc(schema.userRoleAssignments.createdAt));
    return rows.map((row) => this.toAssignment(row.a, row.r));
  }

  // ---------- Mappers ----------

  private toRole(r: typeof schema.roles.$inferSelect): RoleRow {
    return {
      id: r.id,
      orgId: r.orgId,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: (r.permissions ?? []) as string[],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  private toAssignment(
    a: typeof schema.userRoleAssignments.$inferSelect,
    r: typeof schema.roles.$inferSelect | null
  ): RoleAssignmentRow {
    return {
      id: a.id,
      userId: a.userId,
      roleId: a.roleId,
      scopeType: a.scopeType as RoleScopeType,
      scopeId: a.scopeId,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
      grantedByUserId: a.grantedByUserId,
      revokedAt: a.revokedAt,
      revokedByUserId: a.revokedByUserId,
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
      createdAt: a.createdAt,
      role: r ? this.toRole(r) : undefined
    };
  }
}
