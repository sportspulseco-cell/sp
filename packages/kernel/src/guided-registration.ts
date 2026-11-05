import { CONDITIONAL_OPERATORS, QUESTION_TYPES, validateFormDefinition, type FormDefinition } from "./forms";
import { SEASON_REGISTRATION_TYPES, type SeasonRegistrationType } from "./registration-paths";

export interface GuidedRegistrationSetupInput {
  requestId: string; registrationType: SeasonRegistrationType;
  playerPriceCents: number; teamFeeEnabled: boolean; teamPriceCents: number;
  currency: string; requireUsaHockeyId: boolean; formDefinition: FormDefinition;
  publish: boolean; reviewConfirmed: boolean;
}

/** Shared by the guided editor and the atomic API command. Never trust a form cast. */
export function guidedRegistrationProblem(input: GuidedRegistrationSetupInput): string | null {
  if (!(SEASON_REGISTRATION_TYPES as readonly string[]).includes(input.registrationType)) return "Choose who can register.";
  for (const price of [input.playerPriceCents, input.teamPriceCents])
    if (!Number.isSafeInteger(price) || price < 0 || price > 99999999) return "Use a valid, non-negative registration price.";
  if (!/^[A-Z]{3}$/.test(input.currency)) return "Choose a valid currency.";
  if (!input.teamFeeEnabled && input.teamPriceCents !== 0) return "Team fees are off. Set the team price to zero or explicitly enable a team fee.";
  if (input.publish && !input.reviewConfirmed) return "Confirm that the registration details, prices and waiver text are ready to publish.";
  const form = input.formDefinition;
  if (!form || form.schemaVersion !== 1 || !Array.isArray(form.questions) || form.questions.length > 50)
    return "Use a valid registration form with up to 50 custom questions.";
  const types = new Set(QUESTION_TYPES.map(t => t.value));
  if (form.questions.some(q => !q || typeof q !== "object" || typeof q.key !== "string" || typeof q.label !== "string" || !types.has(q.type)))
    return "Check each custom question's type, label and key.";
  for (const q of form.questions) {
    if (typeof q.required !== "boolean" || typeof q.isActive !== "boolean") return "Check whether each custom question is required and enabled.";
    if ((q.type === "select" || q.type === "multi_select") && (!Array.isArray(q.options) || q.options.some(o =>
      !o || typeof o.value !== "string" || typeof o.label !== "string"))) return "Give each choice a valid label and value.";
    if (q.conditional && (typeof q.conditional.sourceQuestionKey !== "string" ||
      !CONDITIONAL_OPERATORS.some(o => o.value === q.conditional!.operator))) return "Choose a valid conditional rule for each question.";
  }
  for (const key of ["liabilityWaiver", "codeOfConduct", "photoRelease"] as const) {
    const document = form.waivers?.[key];
    if (!document || typeof document.enabled !== "boolean" || typeof document.content !== "string" || (document.enabled && !document.content.trim()))
      return "Review the text of each enabled waiver or consent document.";
  }
  try {
    if (new TextEncoder().encode(JSON.stringify(form)).length > 90000) return "Use fewer questions or shorter document text before saving this setup.";
    const problems = validateFormDefinition(form);
    return problems.length ? problems[0]! : null;
  } catch { return "Check the custom questions and their conditional rules."; }
}
