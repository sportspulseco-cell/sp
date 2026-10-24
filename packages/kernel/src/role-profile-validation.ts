/**
 * Validation for role-profile answers (ROLE_PROFILE_SCHEMAS or an
 * admin-configured role_profile form). One rule set shared by every
 * screen that edits a profile (admin Edit user profile, player Profile
 * page, onboarding) and by the API, so the same answers are accepted or
 * refused everywhere.
 *
 * - Required questions must be filled (`checkRequired`; the API skips
 *   it because invites and onboarding may save a profile part-way).
 * - `usaHockeyId`: USA Hockey format (governing-body-ids).
 * - `usaHockeyIdExpiry`: must be in the future when given.
 * - `dob`: a real date, not in the future.
 * - number questions: a number, not negative.
 */
import { visibleQuestions, type AnswerMap, type FormDefinition } from "./forms";
import { validateGoverningBodyId } from "./governing-body-ids";

export type RoleProfileErrors = Record<string, string>;

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

/** Today as YYYY-MM-DD in the caller's local time. */
function todayLocal(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function validateRoleProfileAnswers(
  definition: FormDefinition | null | undefined,
  answers: AnswerMap,
  opts: { checkRequired?: boolean; now?: Date } = {}
): RoleProfileErrors {
  const errors: RoleProfileErrors = {};
  const today = todayLocal(opts.now ?? new Date());
  // Only questions the person can see: a hidden conditional question
  // is never required.
  const questions = definition ? visibleQuestions(definition, answers) : [];
  const labelOf = (key: string) =>
    questions.find((q) => q.key === key)?.label ?? key;

  if (opts.checkRequired !== false) {
    for (const q of questions) {
      if (q.required && isEmpty(answers[q.key])) errors[q.key] = `${q.label} is required`;
    }
  }

  for (const q of questions) {
    const v = answers[q.key];
    if (errors[q.key] || isEmpty(v)) continue;
    if (q.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 0) errors[q.key] = `${q.label} must be a positive number`;
    }
    if (q.type === "date" && (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v))) {
      errors[q.key] = `${q.label} must be a date`;
    }
  }

  const id = answers["usaHockeyId"];
  if (!errors.usaHockeyId && typeof id === "string" && id.trim() !== "") {
    const r = validateGoverningBodyId("USA_HOCKEY", id);
    if (!r.ok) errors.usaHockeyId = `${labelOf("usaHockeyId")}: ${r.reason}`;
  }

  const expiry = answers["usaHockeyIdExpiry"];
  if (!errors.usaHockeyIdExpiry && typeof expiry === "string" && expiry.trim() !== "") {
    if (expiry.slice(0, 10) <= today) {
      errors.usaHockeyIdExpiry = `${labelOf("usaHockeyIdExpiry")} must be in the future`;
    }
  }

  const dob = answers["dob"];
  if (!errors.dob && typeof dob === "string" && dob.trim() !== "") {
    if (dob.slice(0, 10) > today) errors.dob = `${labelOf("dob")} cannot be in the future`;
  }

  return errors;
}
