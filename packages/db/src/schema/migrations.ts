import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  index,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { orgs } from "./iam";

// =====================================================================
// IMPORT_JOBS — bulk-import metadata + rolling progress
// One job per upload. Status drives the UI (pending → running → done|failed).
// =====================================================================
export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    /**
     * persons | teams | registrations | rosters | games — the entity
     * the rows in this job map to.
     */
    entityKind: text("entity_kind").notNull(),
    sourceFilename: text("source_filename"),
    /** Stored CSV preview (first ~200 rows) for inspection. */
    sourcePreview: text("source_preview"),
    /** Frontend → backend column→field mapping. */
    fieldMapping: jsonb("field_mapping").notNull().default(sql`'{}'::jsonb`),
    /** pending | running | succeeded | failed | partial | cancelled */
    status: text("status").notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    processedRows: integer("processed_rows").notNull().default(0),
    successRows: integer("success_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    /** Top-level errors that fail the whole job. Per-row errors live in import_job_rows. */
    error: text("error"),
    submittedByUserId: uuid("submitted_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "import_jobs_status_check",
      sql`${t.status} IN ('pending','running','succeeded','failed','partial','cancelled')`
    ),
    orgStatusIdx: index("import_jobs_org_status_idx").on(t.orgId, t.status),
    createdIdx: index("import_jobs_created_idx").on(t.createdAt.desc())
  })
);

// =====================================================================
// IMPORT_JOB_ROWS — per-row outcome (failed rows mostly)
// =====================================================================
export const importJobRows = pgTable(
  "import_job_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    /** Raw input as parsed from the CSV. */
    raw: jsonb("raw").notNull(),
    /** ok | failed | skipped */
    status: text("status").notNull(),
    error: text("error"),
    /** ID of the entity created (when ok). */
    createdEntityId: uuid("created_entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    jobIdx: index("import_job_rows_job_idx").on(t.jobId, t.rowNumber),
    statusIdx: index("import_job_rows_status_idx").on(t.jobId, t.status)
  })
);
