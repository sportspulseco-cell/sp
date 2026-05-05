/**
 * Canonical form schema for the Registration Module v2.
 *
 * The shape stored in `registration_form_versions.schema` (JSONB) and
 * rendered by the public registration funnel. Single source of truth
 * shared between API validators, the admin Form Builder, and the
 * player-facing renderer — any drift here breaks all three.
 *
 * Persisted as JSONB rather than a relational `form_questions` table
 * because:
 *   - Forms are read whole, on every render of the public funnel.
 *   - Versioning the entire form is simpler than diffing question rows.
 *   - Conditional-logic edits stay within one transaction.
 */

export type QuestionType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "email"
  | "phone"
  | "select"
  | "multi_select"
  | "checkbox"
  | "file_upload";

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Single select" },
  { value: "multi_select", label: "Multi select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "file_upload", label: "File upload" }
];

export type ConditionalOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_any_of";

export const CONDITIONAL_OPERATORS: {
  value: ConditionalOperator;
  label: string;
  /** Question types this operator applies to. */
  appliesTo: QuestionType[];
}[] = [
  {
    value: "equals",
    label: "equals",
    appliesTo: [
      "short_text",
      "long_text",
      "number",
      "date",
      "email",
      "phone",
      "select",
      "checkbox"
    ]
  },
  {
    value: "not_equals",
    label: "does not equal",
    appliesTo: [
      "short_text",
      "long_text",
      "number",
      "date",
      "email",
      "phone",
      "select",
      "checkbox"
    ]
  },
  {
    value: "contains",
    label: "contains",
    appliesTo: ["short_text", "long_text", "multi_select"]
  },
  {
    value: "is_any_of",
    label: "is any of",
    appliesTo: ["select", "multi_select"]
  }
];

/** A condition that gates a question's visibility on another's answer. */
export interface ConditionalLogic {
  /** Source question whose answer drives visibility. */
  sourceQuestionKey: string;
  operator: ConditionalOperator;
  /** Value(s) compared against. JSON-stringified text in the editor; coerced at evaluation. */
  value: string | number | boolean | Array<string | number>;
}

export interface FormQuestion {
  /** Stable identifier for this question — referenced by conditional logic + answer storage. */
  key: string;
  /** Player-facing label. */
  label: string;
  /** Optional player-facing helper text (rendered below the input). */
  helpText?: string;
  type: QuestionType;
  /** Required questions block submission of the step they live on. */
  required: boolean;
  /** Options for select / multi_select. */
  options?: Array<{ value: string; label: string }>;
  /** Optional inline placeholder. */
  placeholder?: string;
  /** Min / max for number questions; minLength / maxLength for text. */
  min?: number;
  max?: number;
  /** When set, hide the question unless the condition is satisfied. */
  conditional?: ConditionalLogic;
  /** Disable a question without removing it (so old answers stay queryable). */
  isActive: boolean;
}

export interface FormDefinition {
  /** Schema version — bump when the shape evolves. */
  schemaVersion: 1;
  questions: FormQuestion[];
}

/** Empty form factory — used as the seed when first opening the Form Builder. */
export function emptyFormDefinition(): FormDefinition {
  return { schemaVersion: 1, questions: [] };
}

/** Generate a stable, lowercase_snake key from a free-form label. */
export function suggestQuestionKey(label: string, taken: ReadonlySet<string>): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!base) return uniq("question", taken);
  return uniq(base, taken);
}

function uniq(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/** Validate a form before publish — returns blocker messages, never throws. */
export function validateFormDefinition(def: FormDefinition): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, q] of def.questions.entries()) {
    const where = `Q${i + 1} (${q.label || q.key || "untitled"})`;
    if (!q.key) errors.push(`${where} has no key.`);
    if (seen.has(q.key))
      errors.push(`${where} duplicates key "${q.key}".`);
    seen.add(q.key);
    if (!q.label?.trim()) errors.push(`${where} has no label.`);
    if (
      (q.type === "select" || q.type === "multi_select") &&
      (!q.options || q.options.length === 0)
    ) {
      errors.push(`${where} is a ${q.type} but has no options.`);
    }
    if (q.conditional) {
      const src = def.questions.find(
        (x) => x.key === q.conditional!.sourceQuestionKey
      );
      if (!src) {
        errors.push(
          `${where} conditional points at unknown question "${q.conditional.sourceQuestionKey}".`
        );
      } else {
        const op = CONDITIONAL_OPERATORS.find(
          (o) => o.value === q.conditional!.operator
        );
        if (op && !op.appliesTo.includes(src.type)) {
          errors.push(
            `${where} uses "${q.conditional.operator}" with a ${src.type} source — operator not supported for that type.`
          );
        }
      }
    }
  }
  return errors;
}

export type AnswerMap = Record<string, unknown>;

/**
 * Evaluate a question's conditional logic against the current answer map.
 * Returns true if the question should be shown.
 *
 * The renderer calls this on every input change to update visibility.
 * The API also calls it server-side before persisting, so a hidden
 * question's answer cannot sneak through.
 */
export function evaluateConditional(
  question: FormQuestion,
  answers: AnswerMap
): boolean {
  if (!question.conditional) return true;
  const c = question.conditional;
  const actual = answers[c.sourceQuestionKey];
  switch (c.operator) {
    case "equals":
      return looseEqual(actual, c.value);
    case "not_equals":
      return !looseEqual(actual, c.value);
    case "contains": {
      if (typeof actual === "string" && typeof c.value === "string") {
        return actual.toLowerCase().includes(c.value.toLowerCase());
      }
      if (Array.isArray(actual)) {
        return actual.some((a) => looseEqual(a, c.value));
      }
      return false;
    }
    case "is_any_of": {
      const list = Array.isArray(c.value) ? c.value : [c.value];
      if (Array.isArray(actual)) {
        return actual.some((a) => list.some((v) => looseEqual(a, v)));
      }
      return list.some((v) => looseEqual(actual, v));
    }
  }
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  // Normalise number/string for select option ids that come back as strings.
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Filter a definition down to the questions the player should see right
 * now (given their current answers). Useful for preview + submit-time
 * validation.
 */
export function visibleQuestions(
  def: FormDefinition,
  answers: AnswerMap
): FormQuestion[] {
  return def.questions.filter(
    (q) => q.isActive && evaluateConditional(q, answers)
  );
}
