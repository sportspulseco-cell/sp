import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  AppendJobRowInput,
  CreateJobInput,
  ImportEntityKind,
  ImportJobRow,
  ImportJobRowEntry,
  ImportRepository,
  ImportStatus,
  ListJobsQuery,
  UpdateJobProgressInput
} from "../../domain/repositories/import.repository";

@Injectable()
export class DrizzleImportRepository implements ImportRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listJobs(q: ListJobsQuery): Promise<Page<ImportJobRow>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.importJobs.orgId, q.orgId));
    if (q.entityKind) cs.push(eq(schema.importJobs.entityKind, q.entityKind));
    if (q.status) cs.push(eq(schema.importJobs.status, q.status));
    if (q.cursor) cs.push(gt(schema.importJobs.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.importJobs)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(desc(schema.importJobs.createdAt))
      .limit(q.limit + 1);
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toJob(r)
    );
    return { items, nextCursor: hasMore ? rows[q.limit - 1]!.id : null };
  }

  async findJob(id: string): Promise<ImportJobRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, id));
    return row ? this.toJob(row) : null;
  }

  async createJob(input: CreateJobInput): Promise<ImportJobRow> {
    const [row] = await this.db
      .insert(schema.importJobs)
      .values({
        orgId: input.orgId ?? null,
        entityKind: input.entityKind,
        sourceFilename: input.sourceFilename ?? null,
        sourcePreview: input.sourcePreview ?? null,
        fieldMapping: input.fieldMapping ?? {},
        totalRows: input.totalRows,
        submittedByUserId: input.submittedByUserId ?? null,
        status: "pending"
      })
      .returning();
    return this.toJob(row!);
  }

  async updateProgress(
    input: UpdateJobProgressInput
  ): Promise<ImportJobRow> {
    const updates: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (input.processedRows !== undefined)
      updates.processedRows = input.processedRows;
    if (input.successRows !== undefined)
      updates.successRows = input.successRows;
    if (input.failedRows !== undefined) updates.failedRows = input.failedRows;
    if (input.status !== undefined) updates.status = input.status;
    if (input.error !== undefined) updates.error = input.error;
    if (input.startedAt !== undefined) updates.startedAt = input.startedAt;
    if (input.finishedAt !== undefined) updates.finishedAt = input.finishedAt;

    await this.db
      .update(schema.importJobs)
      .set(updates as never)
      .where(eq(schema.importJobs.id, input.id));
    const found = await this.findJob(input.id);
    if (!found) throw new Error("import_job not found");
    return found;
  }

  async appendRow(input: AppendJobRowInput): Promise<void> {
    await this.db.insert(schema.importJobRows).values({
      jobId: input.jobId,
      rowNumber: input.rowNumber,
      raw: input.raw as never,
      status: input.status,
      error: input.error ?? null,
      createdEntityId: input.createdEntityId ?? null
    });
  }

  async listJobRows(
    jobId: string,
    statusFilter?: ImportJobRowEntry["status"]
  ): Promise<ImportJobRowEntry[]> {
    const cs = [eq(schema.importJobRows.jobId, jobId)];
    if (statusFilter) cs.push(eq(schema.importJobRows.status, statusFilter));
    const rows = await this.db
      .select()
      .from(schema.importJobRows)
      .where(and(...cs))
      .orderBy(asc(schema.importJobRows.rowNumber));
    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      rowNumber: r.rowNumber,
      raw: (r.raw ?? {}) as Record<string, unknown>,
      status: r.status as ImportJobRowEntry["status"],
      error: r.error,
      createdEntityId: r.createdEntityId,
      createdAt: r.createdAt
    }));
  }

  private toJob(r: typeof schema.importJobs.$inferSelect): ImportJobRow {
    return {
      id: r.id,
      orgId: r.orgId,
      entityKind: r.entityKind as ImportEntityKind,
      sourceFilename: r.sourceFilename,
      sourcePreview: r.sourcePreview,
      fieldMapping: (r.fieldMapping ?? {}) as Record<string, string>,
      status: r.status as ImportStatus,
      totalRows: r.totalRows,
      processedRows: r.processedRows,
      successRows: r.successRows,
      failedRows: r.failedRows,
      error: r.error,
      submittedByUserId: r.submittedByUserId,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
}
