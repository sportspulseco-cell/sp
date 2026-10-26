import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  SUBMISSION_STATUS_FILTERS,
  answerColumns,
  formatAnswer,
  type AnswerMap,
  type FormQuestion,
  type SubmissionStatusFilter
} from "@sportspulse/kernel";
import { toCsv } from "../../../reports/application/csv";

/**
 * A form's submissions with their answers, for the Submissions view and
 * its CSV export. One source for both, so the file always matches the
 * screen. Answers live in `registrations.metadata.answers` (the funnel
 * writes them there); columns come from the form's versions, newest
 * first, plus the funnel's own fields, so every answer has a labelled
 * column. Callers check the form is visible; `visibleWhere` narrows the
 * rows to registrations the caller may read.
 */

export const MAX_SUBMISSIONS = 5000;

export interface FormSubmissionRow {
  id: string;
  personName: string;
  email: string | null;
  dob: string | null;
  status: string;
  divisionId: string | null;
  divisionName: string | null;
  teamName: string | null;
  submissionType: string | null;
  versionNumber: number;
  submittedAt: string | null;
  createdAt: string;
  /** Answer text by column key (option labels, lists joined with "; "). */
  answers: Record<string, string>;
}

export interface FormSubmissions {
  formId: string;
  formName: string;
  status: SubmissionStatusFilter;
  columns: Array<{ key: string; label: string }>;
  items: FormSubmissionRow[];
  total: number;
  truncated: boolean;
}

export function isStatusFilter(v: unknown): v is SubmissionStatusFilter {
  return SUBMISSION_STATUS_FILTERS.some((f) => f.value === v);
}

export async function loadFormSubmissions(
  db: Database,
  formId: string,
  status: SubmissionStatusFilter,
  visibleWhere: SQL | null
): Promise<FormSubmissions | null> {
  const [form] = await db
    .select({ id: schema.registrationForms.id, name: schema.registrationForms.name })
    .from(schema.registrationForms)
    .where(eq(schema.registrationForms.id, formId))
    .limit(1);
  if (!form) return null;

  const versions = await db
    .select({
      id: schema.registrationFormVersions.id,
      versionNumber: schema.registrationFormVersions.versionNumber,
      schema: schema.registrationFormVersions.schema
    })
    .from(schema.registrationFormVersions)
    .where(eq(schema.registrationFormVersions.formId, formId))
    .orderBy(desc(schema.registrationFormVersions.versionNumber));
  const versionNo = new Map(versions.map((v) => [v.id, v.versionNumber]));

  const statuses = SUBMISSION_STATUS_FILTERS.find((f) => f.value === status)?.statuses ?? null;
  const r = schema.registrations;
  const rows = versions.length
    ? await db
        .select({
          id: r.id,
          status: r.status,
          divisionId: r.divisionId,
          divisionName: schema.divisions.name,
          teamName: schema.teams.name,
          formVersionId: r.formVersionId,
          submittedAt: r.submittedAt,
          createdAt: r.createdAt,
          metadata: r.metadata,
          firstName: schema.persons.legalFirstName,
          lastName: schema.persons.legalLastName,
          preferredName: schema.persons.preferredName,
          accountEmail: schema.profiles.email
        })
        .from(r)
        .innerJoin(schema.persons, eq(schema.persons.id, r.subjectPersonId))
        .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
        .leftJoin(schema.divisions, eq(schema.divisions.id, r.divisionId))
        .leftJoin(schema.teams, eq(schema.teams.id, r.teamId))
        .where(
          and(
            inArray(r.formVersionId, versions.map((v) => v.id)),
            ...(statuses ? [inArray(r.status, [...statuses])] : []),
            ...(visibleWhere ? [visibleWhere] : [])
          )
        )
        .orderBy(desc(r.createdAt), desc(r.id))
        .limit(MAX_SUBMISSIONS + 1)
    : [];
  const truncated = rows.length > MAX_SUBMISSIONS;
  const kept = rows.slice(0, MAX_SUBMISSIONS);

  const answerMaps: AnswerMap[] = kept.map((row) => {
    const a = (row.metadata as Record<string, unknown> | null)?.answers;
    return a && typeof a === "object" && !Array.isArray(a) ? (a as AnswerMap) : {};
  });
  const columns = answerColumns(
    versions.map((v) => v.schema as { questions?: FormQuestion[] }),
    answerMaps
  );

  const items: FormSubmissionRow[] = kept.map((row, i) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const legal = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
    const answers: Record<string, string> = {};
    for (const c of columns) {
      const text = formatAnswer(answerMaps[i]![c.key], c.question);
      if (text) answers[c.key] = text;
    }
    return {
      id: row.id,
      personName: str(meta.fullName) ?? (legal || row.preferredName || "Unknown person"),
      email: str(meta.email) ?? row.accountEmail ?? null,
      dob: str(meta.dobDate),
      status: row.status,
      divisionId: row.divisionId,
      divisionName: row.divisionName ?? null,
      teamName: row.teamName ?? str(meta.teamName),
      submissionType: str(meta.submissionType),
      versionNumber: versionNo.get(row.formVersionId) ?? 0,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      answers
    };
  });

  return {
    formId: form.id,
    formName: form.name,
    status,
    columns: columns.map((c) => ({ key: c.key, label: c.label })),
    items,
    total: items.length,
    truncated
  };
}

/**
 * Text typed by players is opened in spreadsheets: a leading = + - @
 * would run as a formula, so it is prefixed with an apostrophe.
 */
function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** CSV of the same rows: fixed columns, then one column per answer. */
export function formSubmissionsCsv(s: FormSubmissions): { filename: string; csv: string } {
  const fixed = [
    ["Submission ID", (r: FormSubmissionRow) => r.id],
    ["Name", (r: FormSubmissionRow) => r.personName],
    ["Email", (r: FormSubmissionRow) => r.email ?? ""],
    ["Date of birth", (r: FormSubmissionRow) => r.dob ?? ""],
    ["Type", (r: FormSubmissionRow) => (r.submissionType ?? "").replace(/_/g, " ")],
    ["Division", (r: FormSubmissionRow) => r.divisionName ?? ""],
    ["Team", (r: FormSubmissionRow) => r.teamName ?? ""],
    ["Status", (r: FormSubmissionRow) => r.status.replace(/_/g, " ")],
    ["Submitted", (r: FormSubmissionRow) => r.submittedAt ?? r.createdAt],
    ["Form version", (r: FormSubmissionRow) => String(r.versionNumber)]
  ] as const;
  // Header names must be unique for toCsv; a question labelled like a
  // fixed column gets its key appended.
  const taken = new Set<string>(fixed.map(([h]) => h));
  const answerHeaders = s.columns.map((c) => {
    let h = c.label;
    if (taken.has(h)) h = `${c.label} (${c.key})`;
    taken.add(h);
    return h;
  });
  const header = [...fixed.map(([h]) => h), ...answerHeaders];
  const rows = s.items.map((r) => {
    const o: Record<string, string> = {};
    for (const [h, get] of fixed) o[h] = safeCell(get(r));
    s.columns.forEach((c, i) => (o[answerHeaders[i]!] = safeCell(r.answers[c.key] ?? "")));
    return o;
  });
  const slug = s.formName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "form";
  const day = new Date().toISOString().slice(0, 10);
  return {
    filename: `${slug}-submissions-${s.status}-${day}.csv`,
    csv: toCsv(rows, header)
  };
}
