/**
 * Player skill level: one list for the registration funnel, the
 * free-agent form, the captain and admin filters, and the division tier a
 * level is checked against (REG-21). The spec (workflow-1 v2, "Level
 * (A/B/C/D)") and division set-up use A to D; the funnel and free-agent
 * form had drifted to A, B, C1, C2, C3, so a C or D division could never
 * match a player. Older answers still carry C1 / C2 / C3: read every
 * stored value through `normalizeSkillLevel`.
 */

export const SKILL_LEVELS = ["A", "B", "C", "D"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  A: "A — Competitive",
  B: "B — Recreational+",
  C: "C — Recreational",
  D: "D — Beginner"
};

export const SKILL_LEVEL_HINTS: Record<SkillLevel, string> = {
  A: "Junior, college or former pro",
  B: "Solid skills, plays at a good pace",
  C: "Plays regularly at a recreational pace",
  D: "Learning to skate and play"
};

/** Codes the funnel and free-agent form stored before REG-21. */
const LEGACY_SKILL_LEVELS: Record<string, SkillLevel> = {
  C1: "C",
  C2: "C",
  C3: "D"
};

export function isSkillLevel(v: unknown): v is SkillLevel {
  return typeof v === "string" && (SKILL_LEVELS as readonly string[]).includes(v);
}

/** A stored or submitted level as A–D; null when absent or not a level. */
export function normalizeSkillLevel(v: unknown): SkillLevel | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  if (isSkillLevel(code)) return code;
  return LEGACY_SKILL_LEVELS[code] ?? null;
}

/** Division tiers: the four levels plus Premier, above A. */
export const DIVISION_TIERS = [...SKILL_LEVELS, "Premier"] as const;
export type DivisionTier = (typeof DIVISION_TIERS)[number];

/**
 * Whether a player's level suits a division's tier. Null when either is
 * unknown (the admin decides); Premier divisions take A players.
 */
export function skillLevelFitsTier(level: unknown, tier: string | null | undefined): boolean | null {
  const l = normalizeSkillLevel(level);
  if (!l || !tier) return null;
  if (tier === "Premier") return l === "A";
  return isSkillLevel(tier) ? l === tier : null;
}
