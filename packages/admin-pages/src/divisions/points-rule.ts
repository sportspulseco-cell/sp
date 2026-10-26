import { DEFAULT_POINTS_RULE, POINTS_RULE_LABELS, type PointsRule } from "@sportspulse/kernel";

/** Form values for the five numbers (strings while typing). */
export type PointsRuleForm = Record<keyof PointsRule, string>;

const KEYS = Object.keys(DEFAULT_POINTS_RULE) as Array<keyof PointsRule>;

export function pointsRuleForm(stored: unknown): PointsRuleForm {
  const raw = (stored ?? {}) as Partial<Record<keyof PointsRule, unknown>>;
  return Object.fromEntries(
    KEYS.map((k) => [k, String(typeof raw[k] === "number" ? raw[k] : DEFAULT_POINTS_RULE[k])])
  ) as PointsRuleForm;
}

/** The rule to store, or a sentence saying which number is wrong. */
export function pointsRuleFromForm(f: PointsRuleForm): { rule: PointsRule } | { problem: string } {
  const rule = {} as PointsRule;
  for (const k of KEYS) {
    const n = Number(f[k]);
    if (f[k].trim() === "" || !Number.isInteger(n) || n < 0 || n > 10) {
      return { problem: `${POINTS_RULE_LABELS[k]} must be a whole number from 0 to 10.` };
    }
    rule[k] = n;
  }
  return { rule };
}

