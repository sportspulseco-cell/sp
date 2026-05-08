/**
 * Per-governing-body external ID format validators. Used by the public
 * registration funnel + the player-self compliance endpoint so the same
 * regex governs both write paths. Add a new entry here when onboarding
 * a new governing body.
 */

export interface GoverningBodyIdRule {
  code: string;
  label: string;
  /** Format check applied to the ID *after* trimming. */
  pattern: RegExp;
  /** Hint shown in the input help text. */
  formatHint: string;
}

export const GOVERNING_BODY_ID_RULES: Record<string, GoverningBodyIdRule> = {
  USA_HOCKEY: {
    code: "USA_HOCKEY",
    label: "USA Hockey",
    pattern: /^[A-Z0-9]{6,12}$/i,
    formatHint: "6–12 alphanumeric characters (case-insensitive)"
  }
};

/** Permissive fallback for bodies we haven't catalogued yet. */
const FALLBACK_PATTERN = /^[A-Z0-9-]{4,32}$/i;

export type ValidateGoverningBodyIdResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

export function validateGoverningBodyId(
  bodyCode: string,
  externalId: string
): ValidateGoverningBodyIdResult {
  const trimmed = externalId.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "ID cannot be empty" };
  }
  const rule = GOVERNING_BODY_ID_RULES[bodyCode.toUpperCase()];
  const pattern = rule?.pattern ?? FALLBACK_PATTERN;
  if (!pattern.test(trimmed)) {
    return {
      ok: false,
      reason: rule
        ? `Format must be ${rule.formatHint}`
        : "ID format is not recognised"
    };
  }
  return { ok: true, normalized: trimmed.toUpperCase() };
}
