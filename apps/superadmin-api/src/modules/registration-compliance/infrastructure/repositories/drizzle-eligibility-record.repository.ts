import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { EligibilityRecord } from "../../domain/entities/eligibility-record.entity";
import { EligibilityRecordId } from "../../domain/identifiers";
import type {
  EligibilityRecordRepository,
  ListEligibilityQuery
} from "../../domain/repositories/eligibility-record.repository";

@Injectable()
export class DrizzleEligibilityRecordRepository
  implements EligibilityRecordRepository
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: EligibilityRecordId): Promise<EligibilityRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.eligibilityRecords)
      .where(eq(schema.eligibilityRecords.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListEligibilityQuery): Promise<Page<EligibilityRecord>> {
    const cs = [];
    if (q.personId) cs.push(eq(schema.eligibilityRecords.personId, q.personId));
    if (q.seasonId) cs.push(eq(schema.eligibilityRecords.seasonId, q.seasonId));
    if (q.governingBodyId)
      cs.push(eq(schema.eligibilityRecords.governingBodyId, q.governingBodyId));
    if (q.status) cs.push(eq(schema.eligibilityRecords.status, q.status));
    if (q.cursor) cs.push(gt(schema.eligibilityRecords.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.eligibilityRecords)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.eligibilityRecords.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(rec: EligibilityRecord): Promise<void> {
    const x = rec.toSnapshot();
    await this.db.insert(schema.eligibilityRecords).values({
      id: x.id,
      personId: x.personId,
      seasonId: x.seasonId,
      governingBodyId: x.governingBodyId,
      ruleEvaluation: x.ruleEvaluation,
      status: x.status,
      waiverReason: x.waiverReason,
      effectiveFrom: x.effectiveFrom,
      effectiveTo: x.effectiveTo,
      evaluatedAt: x.evaluatedAt,
      evaluatedByUserId: x.evaluatedByUserId
    });
  }

  async save(rec: EligibilityRecord): Promise<void> {
    const x = rec.toSnapshot();
    await this.db
      .update(schema.eligibilityRecords)
      .set({
        ruleEvaluation: x.ruleEvaluation,
        status: x.status,
        waiverReason: x.waiverReason,
        effectiveTo: x.effectiveTo,
        evaluatedAt: x.evaluatedAt,
        evaluatedByUserId: x.evaluatedByUserId,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.eligibilityRecords.id, x.id));
  }

  private toDomain(r: typeof schema.eligibilityRecords.$inferSelect): EligibilityRecord {
    return EligibilityRecord.rehydrate({
      id: r.id,
      personId: r.personId,
      seasonId: r.seasonId,
      governingBodyId: r.governingBodyId,
      ruleEvaluation: r.ruleEvaluation as Record<string, unknown>,
      status: r.status as never,
      waiverReason: r.waiverReason,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      evaluatedAt: r.evaluatedAt,
      evaluatedByUserId: r.evaluatedByUserId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }
}
