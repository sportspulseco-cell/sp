"use client";

import { Field, Input } from "@sportspulse/ui";
import { DEFAULT_POINTS_RULE, POINTS_RULE_LABELS, type PointsRule } from "@sportspulse/kernel";
import type { PointsRuleForm } from "./points-rule";

export { pointsRuleForm, pointsRuleFromForm, type PointsRuleForm } from "./points-rule";

const KEYS = Object.keys(DEFAULT_POINTS_RULE) as Array<keyof PointsRule>;

/**
 * Points per result for standings (FR-3.13.1). Same labels everywhere
 * (kernel POINTS_RULE_LABELS). Standings use them the next time a game is
 * finalized or the standings are recomputed.
 */
export function PointsRuleFields({
  value,
  onChange,
  disabled
}: {
  value: PointsRuleForm;
  onChange: (next: PointsRuleForm) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-fg">Standings points</legend>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {KEYS.map((k) => (
          <Field key={k} label={POINTS_RULE_LABELS[k]}>
            {/* No min/max/required: the browser's own bubble would block the
                save before pointsRuleFromForm can say which number is wrong. */}
            <Input
              type="number"
              inputMode="numeric"
              step={1}
              disabled={disabled}
              value={value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            />
          </Field>
        ))}
      </div>
    </fieldset>
  );
}
