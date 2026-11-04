"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { statusLabel } from "@sportspulse/kernel";
import { Alert, Button, Select } from "@sportspulse/ui";
import { useFormsBuilderApi } from "./context";
import { publishableDraft, sameFormSchema } from "./form-versions";

/**
 * Visibility dropdown + Publish button. "Publish registration" makes the
 * NEWEST draft the live version. The draft is picked by version number,
 * never by list order: the org-admin API listed versions in table order,
 * so `versions.find((v) => !v.locked)` published the oldest autosave
 * draft ("Untitled question", v1) over the version the admin had just
 * published from the Form builder (v3) (staging, 4 Nov 2026). When the
 * newest version is already live, nothing is published.
 */
export function ReviewActions({
  formId,
  publishable,
  hasActiveVersion,
  activeVersionId = null,
  seasonStatus = null,
  seasonHref = null
}: {
  formId: string;
  publishable: boolean;
  hasActiveVersion: boolean;
  /** The live version, so an older draft is never published over it. */
  activeVersionId?: string | null;
  /** The bound season's status (seasons.status); null when the form has no season. */
  seasonStatus?: string | null;
  /** The season page, where a Draft season is opened. */
  seasonHref?: string | null;
}) {
  const { registration } = useFormsBuilderApi();
  const router = useRouter();
  const [visibility, setVisibility] = useState<"draft" | "live">(
    hasActiveVersion ? "live" : "draft"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const versions = await registration.listFormVersions(formId);
      const live = activeVersionId
        ? versions.find((v) => v.id === activeVersionId) ?? null
        : null;
      const draft = publishableDraft(versions, activeVersionId);
      if (!draft && !live) {
        throw new Error(
          "No draft version to publish. Build the form in the Form builder section first."
        );
      }
      // The autosave that lands right after the Form builder's own Publish
      // repeats the live version; publishing it would change nothing.
      if (!draft || sameFormSchema(draft, live)) {
        setVisibility("live");
        setSuccess("The latest version is already live.");
        return;
      }
      await registration.publishFormVersion(formId, draft.id);
      setVisibility("live");
      setSuccess("Published.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // A live form does not open the season. A Draft season opens by itself
  // once its opening date has passed (hourly job), or now from its page.
  const showSeasonLine = !!seasonStatus && (!!success || hasActiveVersion);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Visibility
        </p>
        <Select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "draft" | "live")}
        >
          <option value="draft">Draft</option>
          <option value="live">Live</option>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        {error ? (
          <Alert tone="error" className="py-1">{error}</Alert>
        ) : null}
        {success ? (
          <Alert tone="success" role="status" className="py-1">{success}</Alert>
        ) : null}
        <Button type="button" onClick={publish} disabled={!publishable || busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Publish registration
          </span>
        </Button>
      </div>
      {showSeasonLine ? (
        <p className="w-full text-[12px] text-fg-muted">
          Season status: {statusLabel(seasonStatus)}.
          {seasonStatus === "draft" && seasonHref ? (
            <>
              {" "}
              <a href={seasonHref} className="font-medium text-[--accent] hover:underline">
                Open registration on the season page
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
