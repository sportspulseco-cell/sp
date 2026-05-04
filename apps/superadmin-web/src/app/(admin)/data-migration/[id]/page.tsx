import { ArrowLeft, Database } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dataMigration } from "@/lib/api/server-api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata = { title: "Import job — SportsPulse" };

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function ImportJobDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await dataMigration.getJob(id).catch(() => null);
  if (!job) notFound();

  const failedRows = await dataMigration.jobRows(id, "failed").catch(() => []);

  return (
    <div className="space-y-8">
      <Link
        href="/data-migration"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All imports
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Database} tint="violet" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>IMPORT · {job.id.slice(0, 8)}</Eyebrow>
          <h1 className="font-mono text-[36px] font-semibold uppercase tracking-tight text-fg">
            {job.entityKind}
          </h1>
          <div className="flex items-center gap-2 pt-1">
            <Badge mono>{job.status}</Badge>
            {job.sourceFilename ? (
              <span className="font-mono text-[11px] text-fg-muted">
                {job.sourceFilename}
              </span>
            ) : null}
          </div>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-3 text-right">
          <Stat label="Total" value={job.totalRows} />
          <Stat
            label="OK"
            value={job.successRows}
            tone={job.successRows > 0 ? "success" : undefined}
          />
          <Stat
            label="Failed"
            value={job.failedRows}
            tone={job.failedRows > 0 ? "danger" : undefined}
          />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <DetailRow label="Started" value={fmt(job.startedAt)} />
        <DetailRow label="Finished" value={fmt(job.finishedAt)} />
        <DetailRow label="Submitted" value={fmt(job.createdAt)} />
      </section>

      {job.error ? (
        <section className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5">
          <Eyebrow>Job error</Eyebrow>
          <p className="mt-2 font-mono text-[12px] text-rose-600 dark:text-rose-400">
            {job.error}
          </p>
        </section>
      ) : null}

      {failedRows.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1">
          <header className="border-b border-border px-6 py-4">
            <Eyebrow>Failed rows</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {failedRows.length} row(s) couldn't be imported. Fix the source
              CSV and re-run.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {failedRows.map((r) => (
              <li key={r.id} className="px-6 py-3">
                <p className="font-mono text-[11px] text-fg-muted">
                  Row {r.rowNumber}
                </p>
                <p className="mt-0.5 text-sm text-rose-600 dark:text-rose-400">
                  {r.error ?? "Unknown error"}
                </p>
                <pre className="mt-1 overflow-auto font-mono text-[10px] text-fg-muted">
                  {JSON.stringify(r.raw, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="min-w-[100px] rounded-lg border border-border bg-surface-1 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p
        className={
          "mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight " +
          (tone === "success"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "danger"
              ? "text-rose-600 dark:text-rose-400"
              : "text-fg")
        }
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className="mt-1 font-mono text-[12px] text-fg">{value}</p>
    </div>
  );
}
