/**
 * Free-agent pool (UC-03): labels, availability reading and the offer
 * rules shared by the API, the captain console and the admin consoles.
 *
 * An offer is a personal `team_invites` row whose metadata carries
 * `source: "free_agent_pool"` and the pool entry id. The pool entry stays
 * `active` while offers are out (several teams may pitch the same
 * player); it becomes `placed` only when the player accepts one, in the
 * same transaction that adds them to the roster.
 */

import { normalizeSkillLevel, SKILL_LEVEL_LABELS, SKILL_LEVELS } from "./skill-levels";

export const FREE_AGENT_OFFER_SOURCE = "free_agent_pool" as const;

/** Offers expire like captain invites (7 days), never after the roster lock. */
export const FREE_AGENT_OFFER_TTL_DAYS = 7;

export const FREE_AGENT_POSITIONS = [
  { value: "C", label: "Center" },
  { value: "LW", label: "Left Wing" },
  { value: "RW", label: "Right Wing" },
  { value: "D", label: "Defense" },
  { value: "G", label: "Goalie" }
] as const;

/** The pool uses the one skill-level list (REG-21). */
export const FREE_AGENT_LEVELS = SKILL_LEVELS.map((value) => ({
  value,
  label: SKILL_LEVEL_LABELS[value]
}));

export const FREE_AGENT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type FreeAgentDay = (typeof FREE_AGENT_DAYS)[number];

/**
 * FR-3.4.7 auto-pitch: rank the teams a new free agent fits. Only teams
 * with an open roster spot are pitched. Level: +2 when the division's
 * tier is the player's level, +1 when it is one level away. Position:
 * +1 for each of the player's positions nobody on the team plays. Ties
 * go to the team with more open spots. At most `limit` teams.
 */
export function rankFreeAgentPitch<T extends {
  teamId: string;
  divisionTier: string | null;
  openSpots: number;
  rosterPositions: readonly (string | null)[];
}>(
  player: { level: string | null; positions: readonly string[] },
  teams: readonly T[],
  limit = 10
): Array<T & { score: number }> {
  const level = normalizeSkillLevel(player.level);
  const order = SKILL_LEVELS as readonly string[];
  return teams
    .filter((t) => t.openSpots > 0)
    .map((t) => {
      const tier = normalizeSkillLevel(t.divisionTier);
      let score = 0;
      if (level && tier) {
        const gap = Math.abs(order.indexOf(level) - order.indexOf(tier));
        score += gap === 0 ? 2 : gap === 1 ? 1 : 0;
      }
      const have = new Set(t.rosterPositions.filter((p): p is string => !!p).map((p) => p.toUpperCase()));
      for (const p of player.positions) if (!have.has(p.toUpperCase())) score += 1;
      return { ...t, score };
    })
    .sort((a, b) => b.score - a.score || b.openSpots - a.openSpots || a.teamId.localeCompare(b.teamId))
    .slice(0, limit);
}

export function freeAgentPositionLabel(code: string): string {
  return FREE_AGENT_POSITIONS.find((p) => p.value === code)?.label ?? code;
}

/** Label for a stored level; older C1 / C2 / C3 rows read as C or D. */
export function freeAgentLevelLabel(code: string): string {
  const level = normalizeSkillLevel(code);
  return level ? SKILL_LEVEL_LABELS[level] : code;
}

/**
 * Days a free agent marked available. The player form stores
 * `{ "Mon": ["AM","EVE"], ... }`; older rows used lowercase keys or
 * booleans. A day counts when its value is a non-empty list or `true`.
 */
export function freeAgentAvailableDays(
  availability: Record<string, unknown> | null | undefined
): FreeAgentDay[] {
  const av = availability ?? {};
  const byLower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(av)) byLower.set(k.toLowerCase().slice(0, 3), v);
  return FREE_AGENT_DAYS.filter((d) => {
    const v = byLower.get(d.toLowerCase());
    return v === true || (Array.isArray(v) && v.length > 0);
  });
}

/** "Mon, Wed, Sat" or "—". */
export function formatFreeAgentAvailability(
  availability: Record<string, unknown> | null | undefined
): string {
  const days = freeAgentAvailableDays(availability);
  return days.length === 0 ? "—" : days.join(", ");
}

/** When an offer made `now` expires: 7 days, cut to the roster lock when that is sooner and still ahead. */
export function freeAgentOfferExpiry(now: Date, rosterLockAt: Date | null | undefined): Date {
  const ttl = new Date(now.getTime() + FREE_AGENT_OFFER_TTL_DAYS * 24 * 60 * 60 * 1000);
  if (rosterLockAt && rosterLockAt.getTime() > now.getTime() && rosterLockAt < ttl) {
    return rosterLockAt;
  }
  return ttl;
}

export type FreeAgentOfferStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";

/** Invite status as the player and captain should read it (a pending offer past its expiry is expired). */
export function freeAgentOfferStatus(
  inviteStatus: string,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): FreeAgentOfferStatus {
  const open = inviteStatus === "pending" || inviteStatus === "extended";
  if (open) {
    const exp = expiresAt ? new Date(expiresAt) : null;
    return exp && exp.getTime() < now.getTime() ? "expired" : "pending";
  }
  if (inviteStatus === "accepted" || inviteStatus === "declined" || inviteStatus === "revoked") {
    return inviteStatus;
  }
  return "expired";
}

export const FREE_AGENT_OFFER_STATUS_LABELS: Record<FreeAgentOfferStatus, string> = {
  pending: "Offer sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  revoked: "Withdrawn"
};
