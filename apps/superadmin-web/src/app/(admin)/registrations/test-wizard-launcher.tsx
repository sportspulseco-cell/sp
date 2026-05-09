"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@sportspulse/ui";
import { registration } from "@/lib/api/browser-api";

/**
 * One row per season in the launcher panel. Clicking "Test wizard":
 *   - If a season-bound form already exists, opens the wizard in a
 *     new tab against that season.
 *   - Otherwise, POSTs a stub registration form (scope=season,
 *     purpose=season_registration, name="<Season> registration") and
 *     opens the wizard.
 *
 * The stub form has no published version yet — the wizard will render
 * an empty Phase 2 (Details) until the admin opens /forms/[id] and
 * publishes a version. That's intentional: the user's question was
 * "let me see the wizard now", not "let me design the form first".
 */
export function TestWizardLauncher({
  season,
  existingFormId
}: {
  season: {
    id: string;
    name: string;
    orgId: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  existingFormId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setError(null);
    if (existingFormId) {
      window.open(`/registration/${season.id}`, "_blank", "noopener,noreferrer");
      return;
    }
    setBusy(true);
    try {
      // Create a stub form bound to this season + publish an empty
      // version. Without a *locked* version, the public-registration
      // controller errors with "No registration form is configured" so
      // the funnel won't render. An empty published version is enough
      // — Phase 2 (Details) shows the Team-info card (when path=team)
      // + an empty FormRenderer area until the admin adds questions
      // via /forms/[id] Form-builder section.
      const form = await registration.createForm({
        orgId: season.orgId,
        scope: "season",
        scopeId: season.id,
        seasonId: season.id,
        name: `${season.name} registration`,
        description: "team_captain_led",
        purpose: "season_registration"
      });
      const version = await registration.createFormVersion(form.id, {
        schema: { schemaVersion: 1, questions: [] }
      });
      await registration.publishFormVersion(form.id, version.id);
      window.open(`/registration/${season.id}`, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{season.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {season.startDate} → {season.endDate}
          </p>
          <Badge mono>{season.status.replace(/_/g, " ")}</Badge>
          {existingFormId ? (
            <Badge mono tone="success">
              form bound
            </Badge>
          ) : null}
        </div>
        {error ? (
          <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={launch}
        disabled={busy}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 font-mono text-[10px] uppercase tracking-widest text-blue-700 hover:bg-blue-500/15 disabled:opacity-50 dark:text-blue-300"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
        ) : (
          <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
        )}
        Test wizard
      </button>
    </li>
  );
}
