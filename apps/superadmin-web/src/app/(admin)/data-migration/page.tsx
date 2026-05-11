import { Database, Upload, Activity, AlertCircle } from "lucide-react";
import Link from "next/link";
import { dataMigration, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { ImportRunner } from "@/components/data-migration/import-runner";
import type { ImportStatus } from "@/lib/api/types";

export const metadata = { title: "Data Migration — SportsPulse" };

function tintForStatus(s: ImportStatus): Tint {
  switch (s) {
    case "succeeded":
      return "emerald";
    case "running":
      return "amber";
    case "partial":
      return "amber";
    case "failed":
      return "rose";
    case "cancelled":
      return "neutral";
    default:
      return "blue";
  }
}

function statusTone(s: ImportStatus) {
  if (s === "succeeded") return "success" as const;
  if (s === "running" || s === "partial") return "warning" as const;
  if (s === "failed") return "danger" as const;
  return "neutral" as const;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function DataMigrationPage() {
  const [supported, jobs, orgList] = await Promise.all([
    dataMigration.supportedKinds().catch(() => ({ kinds: [] })),
    dataMigration
      .listJobs({ limit: 50 })
      .catch(() => ({ items: [], nextCursor: null })),
    orgs.list({ limit: 200 }).catch(() => ({ items: [], nextCursor: null }))
  ]);

  const total = jobs.items.length;
  const succeeded = jobs.items.filter((j) => j.status === "succeeded").length;
  const running = jobs.items.filter((j) => j.status === "running").length;
  const failed = jobs.items.filter((j) => j.status === "failed").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ingest"
        title="Data Migration"
        description="Bulk-import CSV data — persons, teams, registrations. Each row maps to a domain write; failures are recorded per-row, never silently dropped."
      />
      <KineticStrip
        cards={[
          { label: "Total jobs", value: total, icon: <Database className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          {
            label: "Running now",
            value: running,
            icon: <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: running > 0 ? "live" : "idle"
          },
          {
            label: "Succeeded",
            value: succeeded,
            icon: <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "ok"
          },
          {
            label: "Failed",
            value: failed,
            icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: failed > 0 ? "warn" : "idle"
          }
        ]}
      />

      {/* Importer card */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center gap-3 border-b border-border px-6 py-4">
          <IconTile icon={Upload} tint="violet" size="sm" />
          <div>
            <Eyebrow>Run import</Eyebrow>
            <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
              CSV → domain entities
            </p>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              Synchronous for ≤1k rows. The first line of the CSV is treated
              as the header — column names map directly to entity fields.
              Supported kinds: {supported.kinds.join(", ") || "(none)"}.
            </p>
          </div>
        </header>
        <div className="p-6">
          <ImportRunner
            supportedKinds={supported.kinds}
            orgs={orgList.items}
          />
        </div>
      </section>

      {/* Recent jobs */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Recent jobs</Eyebrow>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              {jobs.items.length}{" "}
              {jobs.items.length === 1 ? "job" : "jobs"} on file · newest first
            </p>
          </div>
        </header>
        {jobs.items.length === 0 ? (
          <div className="px-6 py-12">
            <EmptyState
              icon={Database}
              title="No imports yet"
              description="Run an import above. Every job is recorded with per-row outcomes for audit."
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
                <TH>File</TH>
                <TH className="text-center">Rows</TH>
                <TH className="text-center">OK</TH>
                <TH className="text-center">Failed</TH>
                <TH>Status</TH>
                <TH>Started</TH>
                <TH>Finished</TH>
              </TR>
            </THead>
            <TBody>
              {jobs.items.map((j) => (
                <TR key={j.id}>
                  <TD>
                    <Link
                      href={`/data-migration/${j.id}`}
                      className="hover:underline"
                    >
                      <span className="inline-flex items-center gap-2">
                        <IconTile
                          icon={Database}
                          tint={tintForStatus(j.status)}
                          size="sm"
                        />
                        <span className="font-mono text-[11px] uppercase tracking-wide text-fg">
                          {j.entityKind}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {j.sourceFilename ?? "—"}
                  </TD>
                  <TD className="text-center font-mono tabular-nums text-fg">
                    {j.totalRows}
                  </TD>
                  <TD className="text-center font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {j.successRows}
                  </TD>
                  <TD
                    className={
                      "text-center font-mono tabular-nums " +
                      (j.failedRows > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-fg-muted")
                    }
                  >
                    {j.failedRows}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(j.status)} mono>
                      {j.status}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {fmt(j.startedAt)}
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {fmt(j.finishedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
