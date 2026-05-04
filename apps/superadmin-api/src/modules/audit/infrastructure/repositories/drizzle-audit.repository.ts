import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  AuditEventRow,
  AuditRepository,
  ListAuditQuery
} from "../../domain/repositories/audit.repository";

@Injectable()
export class DrizzleAuditRepository implements AuditRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(q: ListAuditQuery): Promise<Page<AuditEventRow>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.auditEvents.orgId, q.orgId));
    if (q.actorUserId)
      cs.push(eq(schema.auditEvents.actorUserId, q.actorUserId));
    if (q.resourceType)
      cs.push(eq(schema.auditEvents.resourceType, q.resourceType));
    if (q.resourceId) cs.push(eq(schema.auditEvents.resourceId, q.resourceId));
    if (q.action) cs.push(eq(schema.auditEvents.action, q.action));
    if (q.fromTs) cs.push(gte(schema.auditEvents.tsUtc, new Date(q.fromTs)));
    if (q.toTs) cs.push(lte(schema.auditEvents.tsUtc, new Date(q.toTs)));
    // Cursor pagination by descending ts; cursor is the last seen tsUtc ISO string.
    if (q.cursor) cs.push(lt(schema.auditEvents.tsUtc, new Date(q.cursor)));
    if (q.orgIdsFilter) {
      const orgFilter = inArray(schema.auditEvents.orgId, q.orgIdsFilter);
      const visibility = q.currentUserId
        ? or(orgFilter, eq(schema.auditEvents.actorUserId, q.currentUserId))
        : orgFilter;
      cs.push(visibility!);
    }

    const rows = await this.db
      .select()
      .from(schema.auditEvents)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(desc(schema.auditEvents.tsUtc))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toRow(r)
    );
    const nextCursor = hasMore
      ? rows[q.limit - 1]!.tsUtc.toISOString()
      : null;
    return { items, nextCursor };
  }

  async findById(id: string): Promise<AuditEventRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.id, id));
    return row ? this.toRow(row) : null;
  }

  async distinctActions(limit = 200): Promise<string[]> {
    const rows = await this.db.execute<{ action: string }>(
      sql`SELECT DISTINCT action FROM audit_events ORDER BY action LIMIT ${limit}`
    );
    return rows.map((r) => r.action);
  }

  async distinctResourceTypes(): Promise<string[]> {
    const rows = await this.db.execute<{ resource_type: string }>(
      sql`SELECT DISTINCT resource_type FROM audit_events ORDER BY resource_type LIMIT 100`
    );
    return rows.map((r) => r.resource_type);
  }

  private toRow(r: typeof schema.auditEvents.$inferSelect): AuditEventRow {
    return {
      id: r.id,
      tsUtc: r.tsUtc,
      orgId: r.orgId,
      actorUserId: r.actorUserId,
      onBehalfOfUserId: r.onBehalfOfUserId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      before: (r.before ?? null) as Record<string, unknown> | null,
      after: (r.after ?? null) as Record<string, unknown> | null,
      ipAddr: r.ipAddr,
      userAgent: r.userAgent,
      requestId: r.requestId,
      retentionClass: r.retentionClass,
      createdAt: r.createdAt
    };
  }
}
