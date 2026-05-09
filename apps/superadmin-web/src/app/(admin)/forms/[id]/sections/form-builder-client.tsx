"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Send } from "lucide-react";
import { Button } from "@sportspulse/ui";
import {
  emptyFormDefinition,
  validateFormDefinition,
  type FormDefinition
} from "@sportspulse/kernel";
import { registration } from "@/lib/api/browser-api";
import { FormBuilder } from "@/components/forms/form-builder";
import { SectionHeader } from "./section-header";

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
      return initialSchema as unknown as FormDefinition;
    }
    return emptyFormDefinition();
  });
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
