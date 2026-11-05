import { SKILL_LEVEL_LABELS, SKILL_LEVELS } from "@sportspulse/kernel";
import type {
  BodyChecking,
  BracketType,
  ClockType,
  Gender,
  HomeIceRule,
  OvertimeRule,
  SeriesFormat,
  Tier
} from "../org-setup/types";

/**
 * The words the division forms show for each stored code. The wizard card,
 * the New and Edit division dialogs, the review summary and the division
 * and season pages all read from here, so a page never prints "stopped"
 * where the form said "Stopped clock" (PPHL reads values literally).
 *
 * A plain module on purpose: the detail pages render on the server and
 * cannot read non-component exports from a "use client" file.
 */

// Same A–D labels players pick their level from (REG-21), plus Premier.
export const TIERS: { value: NonNullable<Tier>; label: string }[] = [
  ...SKILL_LEVELS.map((value) => ({ value, label: SKILL_LEVEL_LABELS[value] })),
  { value: "Premier", label: "Premier" }
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "open", label: "Open (any)" },
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
  { value: "mixed", label: "Mixed" }
];

export const CLOCK_TYPES: { value: ClockType; label: string }[] = [
  { value: "stopped", label: "Stopped clock" },
  { value: "running", label: "Running clock" }
];

export const BODY_CHECKING: { value: BodyChecking; label: string }[] = [
  { value: "permitted", label: "Permitted" },
  { value: "not_permitted_penalty", label: "Not permitted, penalty" },
  { value: "not_permitted_no_penalty", label: "Not permitted, no penalty" }
];

export const OVERTIME_RULES: { value: OvertimeRule; label: string }[] = [
  { value: "none", label: "None: score is final" },
  { value: "sudden_death", label: "Sudden death (first goal wins)" },
  { value: "shootout", label: "Penalty shootout (skip OT)" },
  { value: "5_min", label: "5 min overtime period" },
  { value: "10_min", label: "10 min overtime period" }
];

export const SERIES: { value: SeriesFormat; label: string; description: string }[] = [
  {
    value: "best_of_1",
    label: "Single game (best of 1)",
    description:
      "One game determines the winner. Quick-fire single elimination."
  },
  {
    value: "best_of_3",
    label: "Best of 3: first to win 2 games",
    description:
      "Max 3 games per matchup. Catches a single-game fluke. Requires roughly double the ice time of single-game format. Most common in rec leagues."
  },
  {
    value: "best_of_5",
    label: "Best of 5: first to win 3 games",
    description:
      "Max 5 games. Produces the most meaningful result. Used in competitive A divisions and finals. Significant ice-time commitment."
  },
  {
    value: "best_of_7",
    label: "Best of 7: first to win 4 games",
    description:
      "Max 7 games per round. NHL-style. Rare in rec leagues but available for competitive top divisions with long seasons."
  }
];

export const BRACKETS: { value: BracketType; label: string; description: string }[] = [
  {
    value: "single_elim",
    label: "Single elimination",
    description: "One loss and you're out. Fast and decisive."
  },
  {
    value: "double_elim",
    label: "Double elimination",
    description:
      "Teams get a second chance via a loser bracket. More games but rewards consistency."
  },
  {
    value: "round_robin",
    label: "Round-robin",
    description: "Every team plays every other. Twice the games."
  }
];

export const HOME_ICE: { value: HomeIceRule; label: string; description: string }[] = [
  {
    value: "higher_seed_first",
    label: "Higher seed hosts first game(s)",
    description:
      "Determines which team hosts in a series. Higher-seed-hosting gives 1 and 3 the most common option in seeded leagues."
  },
  {
    value: "alternating",
    label: "Alternating",
    description: "Home/away alternates each game in the series."
  },
  {
    value: "neutral",
    label: "Neutral site",
    description: "All games at a neutral location."
  }
];

/**
 * The label for a stored code. An unknown code prints as stored, so a
 * value the catalogue does not know is still visible; nothing prints "—".
 * `short` keeps the part before the colon ("Public", "Best of 3").
 */
export function optionLabel<T extends string>(
  list: ReadonlyArray<{ value: T; label: string }>,
  value: string | null | undefined,
  opts: { short?: boolean } = {}
): string {
  if (value === null || value === undefined || value === "") return "—";
  const label = list.find((x) => x.value === value)?.label ?? value;
  return opts.short ? label.split(":")[0]!.trim() : label;
}

/** "A — Competitive", "Premier", or "—" for no tier. */
export function tierLabel(tier: string | null | undefined): string {
  return optionLabel(TIERS, tier);
}

/** "Open (any)", "Men", "Women", "Mixed". */
export function genderLabel(gender: string | null | undefined): string {
  return optionLabel(GENDERS, gender);
}
