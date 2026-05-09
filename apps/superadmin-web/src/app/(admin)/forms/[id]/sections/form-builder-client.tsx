"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Send } from "lucide-react";
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
 *   - "Save draft" → POST a new draft version with the current schema.
 *   - "Publish"    → POST + immediately publish (locks + sets active).
 *
 * Locked versions are read-only — admin must hit "Edit (new draft)"
 * to spin a fresh version off the current one.
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
  const [busy, setBusy] = useState<"none" | "save" | "publish">("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const issues = validateFormDefinition(schema);
  const valid = issues.length === 0 && schema.questions.length > 0;

  async function saveDraft() {
    setBusy("save");
    setError(null);
    try {
      await registration.createFormVersion(formId, {
        schema: schema as unknown as Record<string, unknown>
      });
      setSuccess("Draft saved.");
      setEditing(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("none");
    }
  }

  async function publish() {
    setBusy("publish");
    setError(null);
    try {
      const v = await registration.createFormVersion(formId, {
        schema: schema as unknown as Record<string, unknown>
      });
      await registration.publishFormVersion(formId, v.id);
      setSuccess("Published.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("none");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Form builder"
        subtitle="Custom questions with conditional logic — drag to reorder"
        action={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
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
                }))
              }
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
          )
        }
      />

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Custom questions
        </p>
        <p className="text-[12px] text-fg-muted">
          Drag questions to reorder. Use conditional logic to show questions
          only when specific answers are given — e.g. show "Glove side?" only
          if position = Goalie.
        </p>
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

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={saveDraft}
          disabled={busy !== "none" || !editing}
        >
          {busy === "save" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Save draft
          </span>
        </Button>
        <Button
          type="button"
          onClick={publish}
          disabled={busy !== "none" || !valid || !editing}
        >
          {busy === "publish" ? (
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
