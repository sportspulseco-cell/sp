/**
 * Ice-hockey scoresheet rules (UC-11, UC-13). Shared by the API, which
 * validates every appended game event, and the admin "Log event" dialog,
 * which renders these lists as dropdowns. Unit tests: hockey-scoring.test.ts.
 *
 * Assists ride on the goal event as `secondaryPersonIds` (at most two,
 * USA Hockey scoring convention), never as a separate event, so the stat
 * reducer counts each assist exactly once (SCH-13).
 *
 * Penalties carry `attributes: { infraction, minutes }` so PIM is summed
 * from the scoresheet, not guessed (SCH-14). Minutes are the four lengths
 * a scorekeeper writes in an adult league: minor 2, double minor 4,
 * major 5, misconduct 10.
 */

export const HOCKEY_SPORT_CODE = "HOCKEY_ICE";

/** Event types the scorekeeper logs from the game page. */
export const HOCKEY_SCORESHEET_EVENT_TYPES = [
  "goal",
  "penalty",
  "shot",
  "save",
  "faceoff_won",
  "block",
  "hit"
] as const;

export const HOCKEY_MAX_ASSISTS = 2;

export const HOCKEY_PENALTY_MINUTES = [2, 4, 5, 10] as const;
export type HockeyPenaltyMinutes = (typeof HOCKEY_PENALTY_MINUTES)[number];

export const HOCKEY_PENALTY_MINUTE_LABELS: Record<HockeyPenaltyMinutes, string> = {
  2: "2 min (minor)",
  4: "4 min (double minor)",
  5: "5 min (major)",
  10: "10 min (misconduct)"
};

/**
 * Penalty class on the scoresheet (FR-3.5.4). Minutes alone cannot tell a
 * game misconduct or a match penalty (both eject the player) from a
 * 10-minute misconduct, so the scorekeeper picks the class; when it is
 * not given it follows from the minutes.
 */
export const HOCKEY_PENALTY_CLASSES = [
  "minor",
  "double_minor",
  "major",
  "misconduct",
  "game_misconduct",
  "match"
] as const;
export type HockeyPenaltyClass = (typeof HOCKEY_PENALTY_CLASSES)[number];

export const HOCKEY_PENALTY_CLASS_LABELS: Record<HockeyPenaltyClass, string> = {
  minor: "Minor",
  double_minor: "Double minor",
  major: "Major",
  misconduct: "Misconduct",
  game_misconduct: "Game misconduct (ejection)",
  match: "Match penalty (ejection)"
};

/** Classes that belong on the misconduct report. */
export const MISCONDUCT_PENALTY_CLASSES: readonly HockeyPenaltyClass[] = ["misconduct", "game_misconduct", "match"];

/** Classes that put the player out of the rest of the game. */
export const EJECTION_PENALTY_CLASSES: readonly HockeyPenaltyClass[] = ["game_misconduct", "match"];

export function isHockeyPenaltyClass(v: unknown): v is HockeyPenaltyClass {
  return typeof v === "string" && (HOCKEY_PENALTY_CLASSES as readonly string[]).includes(v);
}

/** The class a penalty event carries, else the one its minutes imply. */
export function penaltyClassOf(attributes: Record<string, unknown> | null | undefined): HockeyPenaltyClass | null {
  const c = attributes?.penaltyClass;
  if (isHockeyPenaltyClass(c)) return c;
  const m = attributes?.minutes;
  if (m === 2) return "minor";
  if (m === 4) return "double_minor";
  if (m === 5) return "major";
  if (m === 10) return "misconduct";
  return null;
}

/** Infractions as named in the USA Hockey Playing Rules, plus "Other". */
export const HOCKEY_INFRACTIONS = [
  { code: "abuse_of_officials", label: "Abuse of officials" },
  { code: "boarding", label: "Boarding" },
  { code: "body_checking", label: "Body checking (non-check league)" },
  { code: "butt_ending", label: "Butt-ending" },
  { code: "charging", label: "Charging" },
  { code: "checking_from_behind", label: "Checking from behind" },
  { code: "closing_hand_on_puck", label: "Closing hand on puck" },
  { code: "cross_checking", label: "Cross-checking" },
  { code: "delay_of_game", label: "Delay of game" },
  { code: "elbowing", label: "Elbowing" },
  { code: "fighting", label: "Fighting" },
  { code: "head_contact", label: "Illegal contact to the head" },
  { code: "high_sticking", label: "High-sticking" },
  { code: "holding", label: "Holding" },
  { code: "holding_the_stick", label: "Holding the stick" },
  { code: "hooking", label: "Hooking" },
  { code: "illegal_equipment", label: "Illegal equipment" },
  { code: "interference", label: "Interference" },
  { code: "kneeing", label: "Kneeing" },
  { code: "roughing", label: "Roughing" },
  { code: "slashing", label: "Slashing" },
  { code: "spearing", label: "Spearing" },
  { code: "too_many_players", label: "Too many players" },
  { code: "tripping", label: "Tripping" },
  { code: "unsportsmanlike_conduct", label: "Unsportsmanlike conduct" },
  { code: "other", label: "Other" }
] as const;
export type HockeyInfractionCode = (typeof HOCKEY_INFRACTIONS)[number]["code"];

export const HOCKEY_INFRACTION_LABELS: Record<string, string> = Object.fromEntries(
  HOCKEY_INFRACTIONS.map((i) => [i.code, i.label])
);

export interface HockeyEventDraft {
  eventType: string;
  teamId: string | null | undefined;
  primaryPersonId: string | null | undefined;
  secondaryPersonIds: readonly string[] | null | undefined;
  attributes: Record<string, unknown> | null | undefined;
}

/**
 * Null when the event may be stored, otherwise the message to show the
 * scorekeeper. Roster membership is checked by the API (it needs the
 * database); this covers the shape of the event.
 */
export function validateHockeyEvent(e: HockeyEventDraft): string | null {
  const assists = e.secondaryPersonIds ?? [];
  if (e.eventType === "assist") {
    return "Record assists on the goal: pick Assist 1 and Assist 2 when you log the goal.";
  }
  if (e.primaryPersonId && !e.teamId) {
    return "Pick the player's team.";
  }
  if (e.eventType === "goal") {
    if (assists.length > HOCKEY_MAX_ASSISTS) {
      return `A goal has at most ${HOCKEY_MAX_ASSISTS} assists.`;
    }
    if (!e.teamId) return "Pick the team that scored.";
    if (assists.length > 0 && !e.primaryPersonId) {
      return "Pick the goal scorer before adding assists.";
    }
    if (new Set(assists).size !== assists.length) {
      return "Assist 1 and Assist 2 must be different players.";
    }
    if (e.primaryPersonId && assists.includes(e.primaryPersonId)) {
      return "The goal scorer cannot also get the assist.";
    }
    return null;
  }
  if (assists.length > 0) {
    return "Only goals carry assists.";
  }
  if (e.eventType === "penalty") {
    if (!e.teamId) return "Pick the penalized team.";
    const minutes = e.attributes?.minutes;
    if (!(HOCKEY_PENALTY_MINUTES as readonly unknown[]).includes(minutes)) {
      return "Pick the penalty length: 2, 4, 5 or 10 minutes.";
    }
    const infraction = e.attributes?.infraction;
    if (
      typeof infraction !== "string" ||
      !Object.prototype.hasOwnProperty.call(HOCKEY_INFRACTION_LABELS, infraction)
    ) {
      return "Pick the infraction.";
    }
    const cls = e.attributes?.penaltyClass;
    if (cls !== undefined && cls !== null && !isHockeyPenaltyClass(cls)) {
      return "Pick the penalty type.";
    }
  }
  return null;
}
