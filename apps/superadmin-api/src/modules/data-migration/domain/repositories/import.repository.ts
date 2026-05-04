import type { Page, PageQuery } from "@sportspulse/kernel";

export type ImportEntityKind =
  | "persons"
  | "teams"
  | "registrations"
  | "rosters"
  | "games";

export type ImportStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

export interface ImportJobRow {
  id: string;
  orgId: string | null;
  entityKind: ImportEntityKind;
  sourceFilename: string | null;
  sourcePreview: string | null;
  fieldMapping: Record<string, string>;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  error: string | null;
  submittedByUserId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportJobRowEntry {
  id: string;
  jobId: string;
  rowNumber: number;
  raw: Record<string, unknown>;
  status: "ok" | "failed" | "skipped";
  error: string | null;
  createdEntityId: string | null;
  createdAt: Date;
}

export interface CreateJobInput {
  orgId?: string | null;
  entityKind: ImportEntityKind;
  sourceFilename?: string | null;
  sourcePreview?: string | null;
  fieldMapping?: Record<string, string>;
  totalRows: number;
  submittedByUserId?: string | null;
}

export interface UpdateJobProgressInput {
  id: string;
  processedRows?: number;
  successRows?: number;
  failedRows?: number;
  status?: ImportStatus;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export interface AppendJobRowInput {
  jobId: string;
  rowNumber: number;
  raw: Record<string, unknown>;
  status: "ok" | "failed" | "skipped";
  error?: string | null;
  createdEntityId?: string | null;
}

export interface ListJobsQuery extends PageQuery {
  orgId?: string;
  entityKind?: ImportEntityKind;
  status?: ImportStatus;
}

export interface ImportRepository {
  listJobs(q: ListJobsQuery): Promise<Page<ImportJobRow>>;
  findJob(id: string): Promise<ImportJobRow | null>;
  createJob(input: CreateJobInput): Promise<ImportJobRow>;
  updateProgress(input: UpdateJobProgressInput): Promise<ImportJobRow>;
  appendRow(input: AppendJobRowInput): Promise<void>;
  listJobRows(jobId: string, statusFilter?: ImportJobRowEntry["status"]):
    Promise<ImportJobRowEntry[]>;
}

export const IMPORT_REPOSITORY = Symbol("IMPORT_REPOSITORY");
