"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { useFormsBuilderApi } from "./context";

/**
 * Visibility dropdown + Publish button. "Publish registration" only
 * does anything meaningful when the form has at least one draft
 * version — the actual locking happens in the Form builder section.
 * Here we expose the choice to flip the latest draft to active.
 */
export function ReviewActions({
  formId,
  publishable,
  hasActiveVersion
}: {
  formId: string;
  publishable: boolean;
  hasActiveVersion: boolean;
}) {
  const { registration } = useFormsBuilderApi();
  const router = useRouter();
  const [visibility, setVisibility] = useState<"draft" | "live">(
    hasActiveVersion ? "live" : "draft"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function publish() {
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const versions = await registration.listFormVersions(formId);
      const draft = versions.find((v) => !v.locked);
      if (!draft) {
        throw new Error(
          "No draft version to publish. Build the form in the Form builder section first."
        );
      }
      await registration.publishFormVersion(formId, draft.id);
      setVisibility("live");
      setSuccess(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Visibility
        </p>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "draft" | "live")}
          className="h-9 rounded-md border border-border bg-surface-1 px-2 text-[12px] text-fg"
        >
          <option value="draft">Draft</option>
          <option value="live">Live</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        {error ? (
          <span className="font-mono text-[11px] text-rose-700 dark:text-rose-300">
            {error}
          </span>
        ) : null}
        {success ? (
          <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
            Published.
          </span>
        ) : null}
        <Button type="button" onClick={publish} disabled={!publishable || busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Publish registration
          </span>
        </Button>
      </div>
    </div>
  );
}
