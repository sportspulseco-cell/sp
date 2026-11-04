"use client";

import { useId, useState } from "react";
import { Field, Input, Select } from "@sportspulse/ui";
import { MIN_PLAYOFF_SPOTS, playoffSpotsLabel } from "@sportspulse/kernel";

/** The number a fresh "Top N" starts with; the box is focused so the admin types their own. */
const FIRST_TOP_N = 4;

/**
 * Who makes the playoffs (PPHL letter item 4): "Every team in the
 * division" (null) or "Top N" (a number). One select; the number box
 * shows only for Top N. The value is always valid: Top N never commits
 * a count under 2 (or over `max`), and the box snaps back on blur.
 *
 * Used by the season wizard's division card, the New and Edit division
 * dialogs and the Playoffs page, which passes its own labels and hint
 * (the division's live team count, "From the division's settings").
 */
export function PlayoffSpotsFields({
  value,
  onChange,
  label = "Playoff spots",
  allLabel = "Every team in the division",
  countLabel = "How many teams",
  hint,
  max,
  disabled
}: {
  /** null = every team in the division; a number = the top N. */
  value: number | null;
  onChange: (next: number | null) => void;
  label?: string;
  /** The every-team option, e.g. "Every team in the division (7 teams)". */
  allLabel?: string;
  /** Accessible name of the number box. */
  countLabel?: string;
  /** Under the control. Without one, Top N shows its bounds ("2 to 32"). */
  hint?: string;
  max?: number;
  disabled?: boolean;
}) {
  const selectId = useId();
  const [count, setCount] = useState(value === null ? "" : String(value));
  const [lastTop, setLastTop] = useState(value ?? FIRST_TOP_N);
  const [focusCount, setFocusCount] = useState(false);

  // The parent changed the value (another division picked, a copy source
  // chosen): the text follows it. Typing an invalid count never reaches
  // the parent, so the text stays as typed until blur.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== null) {
      setCount(String(value));
      setLastTop(value);
    }
  }

  const valid = (text: string): number | null => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isInteger(n) || n < MIN_PLAYOFF_SPOTS) return null;
    if (max !== undefined && n > max) return null;
    return n;
  };

  const bounds = max === undefined ? `${MIN_PLAYOFF_SPOTS} or more` : `${MIN_PLAYOFF_SPOTS} to ${max}`;

  return (
    <Field label={label} htmlFor={selectId} hint={hint ?? (value === null ? undefined : bounds)}>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Select
            id={selectId}
            value={value === null ? "all" : "top"}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value === "all") {
                onChange(null);
                return;
              }
              setFocusCount(true);
              onChange(lastTop);
            }}
          >
            <option value="all">{allLabel}</option>
            <option value="top">{value === null ? "Top N" : playoffSpotsLabel(value)}</option>
          </Select>
        </div>
        {value !== null ? (
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            min={MIN_PLAYOFF_SPOTS}
            max={max}
            aria-label={countLabel}
            className="w-20 shrink-0"
            autoFocus={focusCount}
            disabled={disabled}
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              const n = valid(e.target.value);
              if (n !== null) onChange(n);
            }}
            onBlur={() => {
              setFocusCount(false);
              if (valid(count) === null) setCount(String(value));
            }}
          />
        ) : null}
      </div>
    </Field>
  );
}
