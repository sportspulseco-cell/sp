"use client";

import {
  visibleQuestions,
  type AnswerMap,
  type FormDefinition,
  type FormQuestion
} from "@sportspulse/kernel";
import { useState } from "react";
import { Field, Input, Select } from "@sportspulse/ui";

/**
 * Renders a `FormDefinition` to the player.
 *
 * Same component used in two places:
 *   1. Admin Form Builder preview (read-only / disabled).
 *   2. Public registration funnel — Wave D will mount this inside the
 *      adaptive form-engine step.
 *
 * Fully controlled: the `initialAnswers` prop IS the answers map (the
 * `initial` prefix is historical). Previously the component kept a
 * local state copy seeded once at mount, which meant typing in any
 * custom question dispatched an onChange with the stale-mount answers
 * map — wiping every reserved key (positions / skill_level / usa_hockey_id
 * etc.) the parent had set since the funnel started. Controlled mode
 * means the parent's map is the truth on every keystroke.
 */
export function FormRenderer({
  definition,
  initialAnswers,
  onChange,
  disabled = false,
  uploadFile
}: {
  definition: FormDefinition;
  initialAnswers?: AnswerMap;
  onChange?: (answers: AnswerMap) => void;
  /** Read-only preview mode (used by the admin builder). */
  disabled?: boolean;
  /**
   * Stores a chosen file and resolves with its URL. When absent, file
   * questions keep only the file name (forms without storage).
   */
  uploadFile?: (file: File) => Promise<string>;
}) {
  const answers = initialAnswers ?? {};
  const visible = visibleQuestions(definition, answers);

  function setAnswer(key: string, value: unknown) {
    onChange?.({ ...answers, [key]: value });
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
          uploadFile={uploadFile}
        />
      ))}
    </div>
  );
}

function QuestionField({
  q,
  value,
  onChange,
  disabled,
  uploadFile
}: {
  q: FormQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled: boolean;
  uploadFile?: (file: File) => Promise<string>;
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
                  // Selection is otherwise only a colour change; screen
                  // readers (and tests) need to know which chips are on.
                  aria-pressed={on}
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
      if (uploadFile) {
        return (
          <UploadField
            label={label}
            hint={q.helpText}
            value={typeof value === "string" ? value : null}
            disabled={disabled}
            upload={uploadFile}
            onChange={onChange}
          />
        );
      }
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

/**
 * File question with real storage: uploads on pick, shows the stored
 * image (or a link), and keeps the URL as the answer. Errors stay next
 * to the field; the previous value is kept when an upload fails.
 */
function UploadField({
  label,
  hint,
  value,
  disabled,
  upload,
  onChange
}: {
  label: string;
  hint?: string;
  value: string | null;
  disabled: boolean;
  upload: (file: File) => Promise<string>;
  onChange: (next: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUrl = !!value && /^https?:\/\//.test(value);
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value!} alt="" className="h-12 w-12 rounded-full border border-border object-cover" />
        ) : null}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || busy}
          aria-label={label}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              onChange(await upload(file));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="block w-full text-[12px] text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-fg hover:file:bg-bg-elev"
        />
      </div>
      {busy ? <p className="mt-1 text-[12px] text-fg-muted">Uploading…</p> : null}
      {!busy && isUrl ? <p className="mt-1 text-[12px] text-fg-muted">Photo uploaded. Save to keep it.</p> : null}
      {!isUrl && value ? <p className="mt-1 text-[12px] text-fg-muted">{value} (not uploaded yet; choose it again)</p> : null}
      {error ? <p className="mt-1 text-[12px] text-rose-600 dark:text-rose-400">{error}</p> : null}
    </Field>
  );
}
