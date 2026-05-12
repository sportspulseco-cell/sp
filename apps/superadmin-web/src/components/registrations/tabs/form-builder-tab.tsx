"use client";

import { useState } from "react";
import { Download, ExternalLink, Upload } from "lucide-react";
import {
  emptyFormDefinition,
  type FormDefinition
} from "@sportspulse/kernel";
import { Button } from "@/components/ui/button";
import { FormBuilder } from "@/components/forms/form-builder";

/**
 * Wave C — Form Builder tab.
 *
 * Edits the canonical kernel `FormDefinition` JSONB. Persistence is
 * client-only for now (export / import via JSON) so the team can iterate
 * on the schema editor without stepping on the existing form-versioning
 * API. Wiring to `registration.createFormVersion` lands when we collapse
 * the season-scoped form lookup convention in Wave D.
 *
 * The same `FormDefinition` produced here drives the public registration
 * funnel via `<FormRenderer>` — single source of truth.
 */
export function FormBuilderTab({ seasonId }: { seasonId: string }) {
  const [def, setDef] = useState<FormDefinition>(emptyFormDefinition());

  function exportJson() {
    const blob = new Blob([JSON.stringify(def, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `form-${seasonId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as FormDefinition;
      if (!parsed || parsed.schemaVersion !== 1)
        throw new Error("Invalid form definition.");
      setDef(parsed);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            // 04 · Form Builder
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
            Form builder
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Custom questions and conditional logic for this season's player
            form. Each question is keyed and versioned — answers persist
            against the key, not the label, so renaming is safe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${
              process.env.NEXT_PUBLIC_PLAYER_WEB_URL ?? "https://sp-player-red.vercel.app"
            }/register/${seasonId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[11px] font-mono uppercase tracking-widest text-white hover:bg-emerald-700"
            title="Open the live wizard exactly as a player would see it"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            Open live wizard
          </a>
          <Button type="button" variant="ghost" onClick={exportJson}>
            <Download className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
            Export JSON
          </Button>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importJson(file);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface-1 px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg">
              <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
              Import
            </span>
          </label>
        </div>
      </header>

      <FormBuilder value={def} onChange={setDef} />

      <p className="rounded-md border border-dashed border-border bg-surface-1 px-3 py-2 text-[11px] text-fg-muted">
        Builder is client-only in this build. Once you've shaped the form,{" "}
        <span className="text-fg">Export JSON</span> and we'll wire it to the
        season's <span className="font-mono">registration_form_version</span>{" "}
        in the next pass — schema is already canonical (kernel{" "}
        <span className="font-mono">FormDefinition</span>).
      </p>
    </div>
  );
}
