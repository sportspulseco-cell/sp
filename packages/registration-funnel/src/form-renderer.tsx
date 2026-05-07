"use client";

import { useState } from "react";
import {
  visibleQuestions,
  type AnswerMap,
  type FormDefinition,
  type FormQuestion
} from "@sportspulse/kernel";
import { Field, Input, Select } from "@sportspulse/ui";

/**
 * Renders a `FormDefinition` to the player.
 *
 * Same component used in two places:
 *   1. Admin Form Builder preview (read-only / disabled).
 *   2. Public registration funnel — Wave D will mount this inside the
 *      adaptive form-engine step.
 *
 * Single source of truth for how answers map to inputs. Conditional
 * logic is evaluated live via `visibleQuestions` from kernel.
 */
export function FormRenderer({
  definition,
  initialAnswers,
  onChange,
  disabled = false
}: {
  definition: FormDefinition;
  initialAnswers?: AnswerMap;
  onChange?: (answers: AnswerMap) => void;
  /** Read-only preview mode (used by the admin builder). */
  disabled?: boolean;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers ?? {});
  const visible = visibleQuestions(definition, answers);

  function setAnswer(key: string, value: unknown) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    onChange?.(next);
  }

  if (visible.length === 0) {
    return (
      <p className="text-[13px] italic text-fg-muted">
        No questions to show right now — the admin hasn't configured any
        custom questions, or all questions are gated by conditional logic.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {visible.map((q) => (
        <QuestionField
          key={q.key}
          q={q}
          value={answers[q.key]}
          onChange={(v) => setAnswer(q.key, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function QuestionField({
  q,
  value,
  onChange,
  disabled
}: {
  q: FormQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled: boolean;
}) {
  const label = q.required ? `${q.label} *` : q.label;

  switch (q.type) {
    case "long_text":
      return (
        <Field label={label} hint={q.helpText}>
          <textarea
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder}
            rows={4}
            className="w-full resize-y rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
          />
        </Field>
      );
    case "checkbox":
      return (
        <Field label={label} hint={q.helpText}>
          <label className="flex items-center gap-2 text-[13px] text-fg">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            <span>Yes</span>
          </label>
        </Field>
      );
    case "select":
      return (
        <Field label={label} hint={q.helpText}>
          <Select
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choose…</option>
            {q.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "multi_select": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field label={label} hint={q.helpText}>
          <div className="flex flex-wrap gap-1.5">
            {q.options?.map((o) => {
              const on = list.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      on
                        ? list.filter((v) => v !== o.value)
                        : [...list, o.value]
                    )
                  }
                  className={
                    on
                      ? "rounded-full bg-fg px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bg"
                      : "rounded-full border border-border bg-surface-1 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Field>
      );
    }
    case "file_upload":
      return (
        <Field label={label} hint={q.helpText ?? "PDF, JPG, PNG. Max 5 MB."}>
          <input
            type="file"
            disabled={disabled}
            onChange={(e) => onChange(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-[12px] text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-fg hover:file:bg-bg-elev"
          />
        </Field>
      );
    default:
      return (
        <Field label={label} hint={q.helpText}>
          <Input
            type={typeFor(q.type)}
            disabled={disabled}
            value={(value as string | number) ?? ""}
            onChange={(e) =>
              onChange(
                q.type === "number" ? Number(e.target.value) : e.target.value
              )
            }
            placeholder={q.placeholder}
          />
        </Field>
      );
  }
}

function typeFor(t: FormQuestion["type"]): string {
  switch (t) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "email":
      return "email";
    case "phone":
      return "tel";
    default:
      return "text";
  }
}
