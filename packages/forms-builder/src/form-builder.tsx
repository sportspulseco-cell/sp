"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Plus,
  Trash2
} from "lucide-react";
import {
  CONDITIONAL_OPERATORS,
  QUESTION_TYPES,
  emptyFormDefinition,
  suggestQuestionKey,
  validateFormDefinition,
  type ConditionalLogic,
  type FormDefinition,
  type FormQuestion,
  type QuestionType
} from "@sportspulse/kernel";
import { cn } from "@sportspulse/ui";
import { Button } from "@sportspulse/ui";
import { Field, Input } from "@sportspulse/ui";
import { Select } from "@sportspulse/ui";
import { FormRenderer } from "@sportspulse/registration-funnel";

/**
 * Reusable Form Builder.
 *
 * Edits a `FormDefinition` (canonical kernel type) — the same JSONB shape
 * stored on `registration_form_versions.schema` and consumed by the
 * public registration funnel. Any drift breaks the render pipeline.
 *
 * Drops into:
 *   - Registration Module v2 § Form Builder tab (admin Season Setup)
 *   - Future: per-org form templates, per-league custom-question editor
 *
 * `value` is fully controlled — parent owns persistence (auto-save on
 * blur typical). Inline preview shows what the player sees, including
 * live conditional-logic evaluation.
 */
export function FormBuilder({
  value,
  onChange,
  className
}: {
  value: FormDefinition;
  onChange: (next: FormDefinition) => void;
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const errors = useMemo(() => validateFormDefinition(value), [value]);
  const takenKeys = useMemo(
    () => new Set(value.questions.map((q) => q.key)),
    [value]
  );

  function patch(idx: number, patch: Partial<FormQuestion>) {
    const next = {
      ...value,
      questions: value.questions.map((q, i) =>
        i === idx ? ({ ...q, ...patch } as FormQuestion) : q
      )
    };
    onChange(next);
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= value.questions.length) return;
    const arr = [...value.questions];
    const [q] = arr.splice(idx, 1);
    arr.splice(target, 0, q!);
    onChange({ ...value, questions: arr });
  }

  function remove(idx: number) {
    if (!confirm("Delete this question?")) return;
    const removed = value.questions[idx];
    if (!removed) return;
    // Drop any conditional that points at the removed question.
    const next = {
      ...value,
      questions: value.questions
        .filter((_, i) => i !== idx)
        .map((q) =>
          q.conditional?.sourceQuestionKey === removed.key
            ? { ...q, conditional: undefined }
            : q
        )
    };
    onChange(next);
    setOpenIndex(null);
  }

  function addQuestion(type: QuestionType) {
    const key = suggestQuestionKey("question", takenKeys);
    const q: FormQuestion = {
      key,
      label: "Untitled question",
      type,
      required: false,
      isActive: true,
      options:
        type === "select" || type === "multi_select"
          ? [
              { value: "option_1", label: "Option 1" },
              { value: "option_2", label: "Option 2" }
            ]
          : undefined
    };
    onChange({ ...value, questions: [...value.questions, q] });
    setOpenIndex(value.questions.length);
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {value.questions.length} question
          {value.questions.length === 1 ? "" : "s"}
          {errors.length > 0 && (
            <span className="ml-2 text-warning">
              · {errors.length} issue{errors.length === 1 ? "" : "s"}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowPreview((s) => !s)}
          >
            <Eye className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
            {showPreview ? "Hide preview" : "Preview"}
          </Button>
          <AddQuestionMenu onPick={addQuestion} />
        </div>
      </div>

      {showPreview && (
        <section className="rounded-xl border border-accent/30 bg-accent-soft p-5">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-accent">
            Preview · player view
          </p>
          <FormRenderer definition={value} disabled />
        </section>
      )}

      {value.questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center">
          <p className="text-[14px] text-fg-muted">
            No custom questions yet. Add one to start collecting answers.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {value.questions.map((q, i) => (
            <QuestionCard
              key={q.key}
              q={q}
              index={i}
              total={value.questions.length}
              isOpen={openIndex === i}
              allQuestions={value.questions}
              takenKeys={takenKeys}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              onPatch={(p) => patch(i, p)}
              onMove={(d) => move(i, d)}
              onDelete={() => remove(i)}
            />
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning">
          <p className="font-medium">Fix before publishing:</p>
          <ul className="mt-1 list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  q,
  index,
  total,
  isOpen,
  allQuestions,
  takenKeys,
  onToggle,
  onPatch,
  onMove,
  onDelete
}: {
  q: FormQuestion;
  index: number;
  total: number;
  isOpen: boolean;
  allQuestions: FormQuestion[];
  takenKeys: ReadonlySet<string>;
  onToggle: () => void;
  onPatch: (patch: Partial<FormQuestion>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <li className="overflow-hidden rounded-md border border-border bg-surface-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
      >
        <span className="font-mono text-[10px] tabular-nums text-fg-muted">
          Q{index + 1}
        </span>
        <span className="flex-1">
          <p className="text-[13px] font-medium text-fg">{q.label || "Untitled"}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {q.type} {q.required && "· required"}{" "}
            {q.conditional && `· conditional on ${q.conditional.sourceQuestionKey}`}{" "}
            {!q.isActive && "· inactive"}
          </p>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-fg-muted transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-border bg-bg-subtle p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label">
              <Input
                value={q.label}
                onChange={(e) => onPatch({ label: e.target.value })}
                onBlur={() => {
                  // Auto-suggest a stable key if it's still the placeholder.
                  if (
                    q.key === "question" ||
                    q.key.startsWith("question_")
                  ) {
                    onPatch({
                      key: suggestQuestionKey(q.label, takenKeys)
                    });
                  }
                }}
              />
            </Field>
            <Field
              label="Key"
              hint="Stable identifier — referenced by conditional logic and answer storage."
            >
              <Input
                value={q.key}
                onChange={(e) =>
                  onPatch({
                    key: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "_")
                  })
                }
              />
            </Field>
            <Field label="Type">
              <Select
                value={q.type}
                onChange={(e) => {
                  const newType = e.target.value as QuestionType;
                  const needsOptions =
                    newType === "select" || newType === "multi_select";
                  onPatch({
                    type: newType,
                    options: needsOptions
                      ? q.options ?? [
                          { value: "option_1", label: "Option 1" },
                          { value: "option_2", label: "Option 2" }
                        ]
                      : undefined
                  });
                }}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Help text (optional)">
              <Input
                value={q.helpText ?? ""}
                onChange={(e) =>
                  onPatch({ helpText: e.target.value || undefined })
                }
                placeholder="Shown to the player below the input."
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ToggleChip
              checked={q.required}
              onChange={(v) => onPatch({ required: v })}
              label="Required"
            />
            <ToggleChip
              checked={q.isActive}
              onChange={(v) => onPatch({ isActive: v })}
              label={q.isActive ? "Active" : "Disabled"}
            />
          </div>

          {(q.type === "select" || q.type === "multi_select") && (
            <OptionEditor
              options={q.options ?? []}
              onChange={(options) => onPatch({ options })}
            />
          )}

          <ConditionalEditor
            value={q.conditional}
            sourceCandidates={allQuestions.filter((c) => c.key !== q.key)}
            onChange={(conditional) => onPatch({ conditional })}
          />

          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                aria-label="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                aria-label="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:bg-rose-500/10 hover:text-rose-500"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.75} />
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function OptionEditor({
  options,
  onChange
}: {
  options: { value: string; label: string }[];
  onChange: (next: { value: string; label: string }[]) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-elev p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Options
      </p>
      <ul className="space-y-2">
        {options.map((opt, i) => (
          <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              placeholder="Label"
              value={opt.label}
              onChange={(e) =>
                onChange(
                  options.map((o, j) =>
                    j === i ? { ...o, label: e.target.value } : o
                  )
                )
              }
            />
            <Input
              placeholder="value"
              value={opt.value}
              onChange={(e) =>
                onChange(
                  options.map((o, j) =>
                    j === i
                      ? {
                          ...o,
                          value: e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, "_")
                        }
                      : o
                  )
                )
              }
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-rose-500/10 hover:text-rose-500"
              aria-label="Remove option"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        onClick={() =>
          onChange([
            ...options,
            {
              value: `option_${options.length + 1}`,
              label: `Option ${options.length + 1}`
            }
          ])
        }
        className="mt-2"
      >
        <Plus className="mr-1.5 h-3 w-3" strokeWidth={2.25} />
        Add option
      </Button>
    </div>
  );
}

function ConditionalEditor({
  value,
  sourceCandidates,
  onChange
}: {
  value?: ConditionalLogic;
  sourceCandidates: FormQuestion[];
  onChange: (next: ConditionalLogic | undefined) => void;
}) {
  const enabled = !!value;
  const source = sourceCandidates.find((s) => s.key === value?.sourceQuestionKey);

  return (
    <div className="rounded-md border border-border bg-bg-elev p-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Conditional logic
        </p>
        <ToggleChip
          checked={enabled}
          onChange={(v) =>
            onChange(
              v
                ? {
                    sourceQuestionKey:
                      sourceCandidates[0]?.key ?? "",
                    operator: "equals",
                    value: ""
                  }
                : undefined
            )
          }
          label={enabled ? "On" : "Off"}
        />
      </div>

      {enabled && (
        <>
          {sourceCandidates.length === 0 ? (
            <p className="mt-3 text-[12px] text-fg-muted">
              Add another question first — conditional logic needs a source.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Select
                value={value?.sourceQuestionKey ?? ""}
                onChange={(e) =>
                  onChange({
                    ...(value as ConditionalLogic),
                    sourceQuestionKey: e.target.value
                  })
                }
              >
                {sourceCandidates.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label || s.key}
                  </option>
                ))}
              </Select>
              <Select
                value={value?.operator ?? "equals"}
                onChange={(e) =>
                  onChange({
                    ...(value as ConditionalLogic),
                    operator: e.target.value as ConditionalLogic["operator"]
                  })
                }
              >
                {CONDITIONAL_OPERATORS.filter(
                  (op) => !source || op.appliesTo.includes(source.type)
                ).map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </Select>
              {source?.type === "select" || source?.type === "multi_select" ? (
                <Select
                  value={String(value?.value ?? "")}
                  onChange={(e) =>
                    onChange({
                      ...(value as ConditionalLogic),
                      value: e.target.value
                    })
                  }
                >
                  {source.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={String(value?.value ?? "")}
                  onChange={(e) =>
                    onChange({
                      ...(value as ConditionalLogic),
                      value: e.target.value
                    })
                  }
                  placeholder="value"
                />
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] text-fg-muted">
            Show this question only when the source question's answer matches.
          </p>
        </>
      )}
    </div>
  );
}

function ToggleChip({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={
        checked
          ? "inline-flex items-center gap-1.5 rounded-full bg-fg px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-bg"
          : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          checked ? "bg-bg" : "bg-fg-subtle"
        }`}
      />
      {label}
    </button>
  );
}

function AddQuestionMenu({ onPick }: { onPick: (t: QuestionType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button onClick={() => setOpen((o) => !o)}>
        <Plus className="mr-2 h-3.5 w-3.5" strokeWidth={2.25} />
        Add question
      </Button>
      {open && (
        <ul
          onMouseLeave={() => setOpen(false)}
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-48 overflow-hidden rounded-md border border-border bg-surface-1 shadow-md"
        >
          {QUESTION_TYPES.map((t) => (
            <li key={t.value}>
              <button
                type="button"
                onClick={() => {
                  onPick(t.value);
                  setOpen(false);
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-fg hover:bg-surface-2"
              >
                {t.label}
                <span className="ml-auto font-mono text-[10px] text-fg-subtle">
                  {t.value}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
