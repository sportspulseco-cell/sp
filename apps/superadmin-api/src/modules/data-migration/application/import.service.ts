import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  IMPORT_REPOSITORY,
  type ImportEntityKind,
  type ImportRepository
} from "../domain/repositories/import.repository";
import { parseCsv } from "./csv-parser";
import { ImporterRegistry } from "./importers/importer";

@Injectable()
export class ImportService {
  private readonly log = new Logger(ImportService.name);

  constructor(
    @Inject(IMPORT_REPOSITORY) private readonly repo: ImportRepository,
    private readonly registry: ImporterRegistry
  ) {}

  /**
   * One-shot synchronous import: parse CSV, create job, run rows, return job.
   * For admin-driven imports of <~1k rows. Larger imports should move to
   * a background queue (BullMQ / similar) — schema is queue-ready.
   */
  async importCsv(args: {
    entityKind: ImportEntityKind;
    csv: string;
    orgId?: string | null;
    sourceFilename?: string | null;
    submittedByUserId?: string | null;
  }) {
    const importer = this.registry.resolve(args.entityKind);
    const { headers, rows } = parseCsv(args.csv);

    const job = await this.repo.createJob({
      orgId: args.orgId ?? null,
      entityKind: args.entityKind,
      sourceFilename: args.sourceFilename ?? null,
      sourcePreview: args.csv.slice(0, 4_000),
      fieldMapping: Object.fromEntries(headers.map((h) => [h, h])),
      totalRows: rows.length,
      submittedByUserId: args.submittedByUserId ?? null
    });

    await this.repo.updateProgress({
      id: job.id,
      status: "running",
      startedAt: new Date()
    });

    let success = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const result = await importer.importRow(row, {
          orgId: args.orgId ?? null,
          submittedByUserId: args.submittedByUserId ?? null
        });
        await this.repo.appendRow({
          jobId: job.id,
          rowNumber: i + 1,
          raw: row,
          status: result.status,
          error: result.error ?? null,
          createdEntityId: result.createdEntityId ?? null
        });
        if (result.status === "ok") success++;
        else if (result.status === "failed") failed++;
      } catch (err) {
        failed++;
        await this.repo.appendRow({
          jobId: job.id,
          rowNumber: i + 1,
          raw: row,
          status: "failed",
          error: (err as Error).message
        });
      }

      if ((i + 1) % 25 === 0 || i === rows.length - 1) {
        await this.repo.updateProgress({
          id: job.id,
          processedRows: i + 1,
          successRows: success,
          failedRows: failed
        });
      }
    }

    const finalStatus =
      failed === 0
        ? "succeeded"
        : success === 0
          ? "failed"
          : "partial";
    return await this.repo.updateProgress({
      id: job.id,
      status: finalStatus,
      processedRows: rows.length,
      successRows: success,
      failedRows: failed,
      finishedAt: new Date()
    });
  }
}
