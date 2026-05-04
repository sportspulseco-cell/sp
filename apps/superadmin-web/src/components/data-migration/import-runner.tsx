"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { dataMigration } from "@/lib/api/browser-api";
import type { ImportEntityKind, Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const SAMPLE_HEADERS: Record<ImportEntityKind, string[]> = {
  persons: [
    "legalFirstName",
    "legalLastName",
    "preferredName",
    "dobDate",
    "countryCode"
  ],
  teams: ["name", "shortName", "sportCode"],
  registrations: ["subjectPersonId", "leagueId", "status"],
  rosters: ["personId", "teamId", "seasonId", "jerseyNumber", "positionCode"],
  games: ["homeTeamId", "awayTeamId", "scheduledStartTsUtc", "sportCode"]
};

export function ImportRunner({
  supportedKinds,
  orgs
}: {
  supportedKinds: ImportEntityKind[];
  orgs: Org[];
}) {
  const router = useRouter();
  const [entityKind, setEntityKind] = useState<ImportEntityKind>(
    supportedKinds[0] ?? "persons"
  );
  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ok: number;
    failed: number;
    status: string;
    id: string;
  } | null>(null);

  function loadSample() {
    const headers = SAMPLE_HEADERS[entityKind];
    setCsv(headers.join(",") + "\n");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    setCsv(await f.text());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const job = await dataMigration.runImport({
        entityKind,
        csv,
        orgId: entityKind === "teams" ? orgId : null,
        sourceFilename: filename
      });
      setResult({
        ok: job.successRows,
        failed: job.failedRows,
        status: job.status,
        id: job.id
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const requiresOrg = entityKind === "teams";
  const submitDisabled =
    loading ||
    !csv.trim() ||
    !supportedKinds.includes(entityKind) ||
    (requiresOrg && !orgId);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field
          label="Entity kind"
          htmlFor="ir-kind"
          hint={
            supportedKinds.includes(entityKind)
              ? `Expected columns: ${SAMPLE_HEADERS[entityKind].join(", ")}`
              : "Importer not implemented for this kind yet."
          }
        >
          <Select
            id="ir-kind"
            value={entityKind}
            onChange={(e) =>
              setEntityKind(e.target.value as ImportEntityKind)
            }
          >
            <optgroup label="Available">
              {supportedKinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </optgroup>
            <optgroup label="Coming soon">
              {(["registrations", "rosters", "games"] as ImportEntityKind[])
                .filter((k) => !supportedKinds.includes(k))
                .map((k) => (
                  <option key={k} value={k} disabled>
                    {k}
                  </option>
                ))}
            </optgroup>
          </Select>
        </Field>
        {requiresOrg ? (
          <Field
            label="Organization"
            htmlFor="ir-org"
            hint="Required — teams attach to one org."
          >
            <Select
              id="ir-org"
              required
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div />
        )}
      </div>

      <Field
        label="CSV file"
        htmlFor="ir-file"
        hint="Or paste below. First line = header row."
      >
        <Input id="ir-file" type="file" accept=".csv,text/csv" onChange={onFile} />
      </Field>

      <Field label="CSV content" htmlFor="ir-csv">
        <div className="space-y-2">
          <textarea
            id="ir-csv"
            required
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={`${SAMPLE_HEADERS[entityKind].join(",")}\nJohn,Smith,Johnny,1990-01-15,US`}
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
          />
          <button
            type="button"
            onClick={loadSample}
            className="font-mono text-[10px] uppercase tracking-wide text-fg-muted hover:text-fg"
          >
            Insert sample header
          </button>
        </div>
      </Field>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      {result ? (
        <p
          className={
            "rounded-md px-3 py-2 text-sm " +
            (result.failed === 0
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
          }
        >
          Job {result.id.slice(0, 8)} → {result.status} ·{" "}
          <strong>{result.ok}</strong> ok · <strong>{result.failed}</strong>{" "}
          failed
        </p>
      ) : null}

      <Button type="submit" disabled={submitDisabled}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" /> Run import
          </>
        )}
      </Button>
    </form>
  );
}
