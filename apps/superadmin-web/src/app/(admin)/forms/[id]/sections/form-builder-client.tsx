"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Send } from "lucide-react";
import { Button } from "@sportspulse/ui";
import {
  defaultWaiversConfig,
  emptyFormDefinition,
  validateFormDefinition,
  type FormDefinition,
  type FormWaiversConfig,
  type WaiverDocConfig
} from "@sportspulse/kernel";
import { registration } from "@/lib/api/browser-api";
import { FormBuilder } from "@/components/forms/form-builder";
import { SectionHeader } from "@sportspulse/forms-builder";

/**
 * Wraps the existing <FormBuilder> in the Registration setup chrome.
 *
 * Save flow:
 *   - Auto-save: every change to the schema is debounced (1.5s) and
 *     saved as a new draft version. The status pill in the header
 *     surfaces "Saving…" / "Saved" so admins never have to guess
 *     whether their edits stuck.
 *   - Publish: locks the latest draft and sets it active.
 *
 * Locked versions render read-only with an "Edit as new draft" CTA
 * in the header that re-enables the editor + spawns a fresh draft on
 * the next change.
 */
export function FormBuilderClient({
  formId,
  initialSchema,
  isLocked,
  hasActiveVersion
}: {
  formId: string;
  initialSchema: Record<string, unknown> | null;
  isLocked: boolean;
  hasActiveVersion: boolean;
}) {
  const router = useRouter();
  const [schema, setSchema] = useState<FormDefinition>(() => {
    if (initialSchema && typeof initialSchema === "object" && "questions" in initialSchema) {
      const seed = initialSchema as unknown as FormDefinition;
      // Back-fill waivers for older v1 drafts that pre-date the field.
      if (!seed.waivers) {
        return { ...seed, waivers: defaultWaiversConfig() };
      }
      return seed;
    }
    return emptyFormDefinition();
  });
  const waivers = schema.waivers ?? defaultWaiversConfig();
  function patchWaiver(
    key: keyof FormWaiversConfig,
    patch: Partial<WaiverDocConfig>
  ) {
    setSchema((s) => {
      const current = s.waivers ?? defaultWaiversConfig();
      return {
        ...s,
        waivers: {
          ...current,
          [key]: { ...current[key], ...patch }
        }
      };
    });
  }
  const [editing, setEditing] = useState(!isLocked);
  const [autosaveStatus, setAutosaveStatus] =
    useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [busyPublish, setBusyPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const issues = validateFormDefinition(schema);
  const valid = issues.length === 0 && schema.questions.length > 0;

  // Debounced auto-save. Skip the first render — that's just the
  // initial state hydration, no mutation to persist. Skip while
  // !editing (locked versions should never auto-save).
  const isFirstRender = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!editing) return;
    setAutosaveStatus("dirty");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void autoSave();
    }, 1500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, editing]);

  async function autoSave() {
    setAutosaveStatus("saving");
    setError(null);
    try {
      await registration.createFormVersion(formId, {
        schema: schema as unknown as Record<string, unknown>
      });
      setAutosaveStatus("saved");
    } catch (err) {
      setAutosaveStatus("error");
      setError((err as Error).message);
    }
  }

  async function publish() {
    setBusyPublish(true);
    setError(null);
    try {
      const v = await registration.createFormVersion(formId, {
        schema: schema as unknown as Record<string, unknown>
      });
      await registration.publishFormVersion(formId, v.id);
      setSuccess("Published — this is now the live version.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyPublish(false);
    }
  }

  function addQuestion() {
    setSchema((s) => ({
      ...s,
      questions: [
        ...s.questions,
        {
          key: `q_${Date.now().toString(36)}`,
          type: "short_text",
          label: "Untitled question",
          required: false,
          isActive: true
        }
      ]
    }));
  }

  const publishDisabledReason = !editing
    ? "This version is locked. Click Edit as new draft to spin a fresh version."
    : schema.questions.length === 0
      ? "Add at least one question before publishing."
      : issues.length > 0
        ? "Fix the validation issues below before publishing."
        : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Form builder"
        subtitle="Custom questions with conditional logic — drag to reorder. Edits auto-save as a draft."
        action={
          <div className="flex items-center gap-2">
            <AutosaveBadge status={autosaveStatus} />
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addQuestion}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  Add question
                </span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  Edit as new draft
                </span>
              </Button>
            )}
          </div>
        }
      />

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Custom questions
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {schema.questions.length} question
            {schema.questions.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-[12px] text-fg-muted">
          Drag questions to reorder. Use conditional logic to show questions
          only when specific answers are given — e.g. show "Glove side?" only
          if position = Goalie.
        </p>

        {schema.questions.length === 0 && editing ? (
          <button
            type="button"
            onClick={addQuestion}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-bg-subtle px-4 py-6 font-mono text-[11px] uppercase tracking-widest text-fg-muted hover:border-accent hover:text-accent"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add your first question
          </button>
        ) : null}

        <div className={editing ? "" : "opacity-60 pointer-events-none"}>
          <FormBuilder value={schema} onChange={setSchema} />
        </div>
        {issues.length > 0 ? (
          <ul className="space-y-1 rounded-md bg-rose-500/10 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300">
            {issues.slice(0, 5).map((iss, i) => (
              <li key={i}>{iss}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Waivers & documents
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Compliance docs shown in Phase 3 of the registration funnel.
            Toggle off to hide a card. Edit the body text directly — the
            content saves with the rest of the form draft.
          </p>
        </div>

        <WaiverEditor
          title="Liability waiver"
          subtitle="Digital signature required — registration blocked if skipped"
          requiredHint="Required when enabled"
          editing={editing}
          config={waivers.liabilityWaiver}
          onChange={(p) => patchWaiver("liabilityWaiver", p)}
        />

        <WaiverEditor
          title="Code of conduct"
          subtitle="Checkbox acknowledgment required"
          requiredHint="Required when enabled"
          editing={editing}
          config={waivers.codeOfConduct}
          onChange={(p) => patchWaiver("codeOfConduct", p)}
        />

        <WaiverEditor
          title="Photo / media release"
          subtitle="Optional — player can decline without blocking"
          requiredHint="Always optional"
          editing={editing}
          config={waivers.photoRelease}
          onChange={(p) => patchWaiver("photoRelease", p)}
        />
      </section>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
          {success}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {publishDisabledReason ? (
          <p className="font-mono text-[11px] text-fg-muted">
            {publishDisabledReason}
          </p>
        ) : null}
        <Button
          type="button"
          onClick={publish}
          disabled={busyPublish || !valid || !editing}
          title={publishDisabledReason ?? "Publish this version"}
        >
          {busyPublish ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            {hasActiveVersion ? "Publish new version" : "Publish"}
          </span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline status pill for the auto-save mechanism. States:
 *   idle    — no edits yet; nothing to surface
 *   dirty   — edits made; debounce timer running ("All changes will save")
 *   saving  — request in flight ("Saving…")
 *   saved   — last persist succeeded ("Saved")
 *   error   — last persist failed ("Save failed — see error below")
 */
function AutosaveBadge({
  status
}: {
  status: "idle" | "dirty" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  if (status === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Unsaved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-blue-700 dark:text-blue-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
        <Check className="h-3 w-3" strokeWidth={2.5} />
        Saved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-rose-700 dark:text-rose-300">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      Save failed
    </span>
  );
}

/**
 * One row in the Waivers & documents section. Header has the title +
 * subtitle + an enable toggle on the right; body has the text the
 * player will see in Phase 3 of the funnel. When disabled, the body
 * collapses (still in state, just hidden) so admins can re-enable
 * without losing what they wrote.
 */
function WaiverEditor({
  title,
  subtitle,
  requiredHint,
  editing,
  config,
  onChange
}: {
  title: string;
  subtitle: string;
  requiredHint: string;
  editing: boolean;
  config: WaiverDocConfig;
  onChange: (patch: Partial<WaiverDocConfig>) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-[12px] text-fg-muted">{subtitle}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {requiredHint}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          aria-label={`Enable ${title}`}
          disabled={!editing}
          onClick={() => onChange({ enabled: !config.enabled })}
          className={
            config.enabled
              ? "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-blue-500 transition-colors disabled:opacity-50"
              : "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-fg-muted/30 transition-colors disabled:opacity-50"
          }
        >
          <span
            className={
              config.enabled
                ? "inline-block h-5 w-5 translate-x-5 rounded-full bg-white shadow transition-transform"
                : "inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform"
            }
          />
        </button>
      </div>
      {config.enabled ? (
        <div className="mt-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Document body — shown to the player
            </span>
            <textarea
              value={config.content}
              onChange={(e) => onChange({ content: e.target.value })}
              disabled={!editing}
              rows={4}
              placeholder="Paste the document text here…"
              className="mt-1.5 w-full resize-y rounded-md border border-border bg-surface-1 p-3 text-[13px] leading-relaxed text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none disabled:opacity-60"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
