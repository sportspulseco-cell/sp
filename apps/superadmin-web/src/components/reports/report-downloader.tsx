"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

interface SelectFilter {
  type: "select";
  param: string;
  label: string;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
}

export function ReportDownloader({
  endpoint,
  filename,
  filters
}: {
  endpoint: string;
  filename: string;
  filters: SelectFilter[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValue(param: string, value: string) {
    setValues((s) => ({ ...s, [param]: value }));
  }

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");

      const params = new URLSearchParams();
      for (const f of filters) {
        const v = values[f.param];
        if (f.required && !v) {
          throw new Error(`${f.label} is required`);
        }
        if (v) params.set(f.param, v);
      }

      const url = `${API}${endpoint}${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body}`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const ready = filters
    .filter((f) => f.required)
    .every((f) => !!values[f.param]);

  return (
    <div className="space-y-3">
      {filters.map((f) => (
        <Field key={f.param} label={f.label} htmlFor={`r-${f.param}`}>
          <Select
            id={`r-${f.param}`}
            required={f.required}
            value={values[f.param] ?? ""}
            onChange={(e) => setValue(f.param, e.target.value)}
          >
            <option value="">{f.required ? `Choose ${f.label.toLowerCase()}` : "All"}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ))}

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        onClick={download}
        disabled={loading || !ready}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" /> Download CSV
          </>
        )}
      </Button>
    </div>
  );
}
