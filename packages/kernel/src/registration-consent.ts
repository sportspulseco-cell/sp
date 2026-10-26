/**
 * Minors and guardian consent in the registration funnel (UC-02, UC-28).
 *
 * One rule for every place that creates or edits a funnel registration
 * (start, resume, Details edit) and for the guardian consent page:
 *   - a registrant under AGE_OF_MAJORITY on the date checked is a minor;
 *   - a minor's registration starts in `pending_consent` and only the
 *     guardian's signed consent moves it to `pending_payment`;
 *   - an adult's starts in `pending_payment` (the funnel confirms the
 *     account email itself, so there is no `pending_verification` step).
 *
 * The guardian signs a short consent text naming the season and the
 * organization. The text is stored as a document version and the
 * signature as a consent record, so the exact words are kept with the
 * signature.
 */
import type { RegistrationState } from "./registration-states";

export const AGE_OF_MAJORITY = 18;

/** Whole years between an ISO date of birth (YYYY-MM-DD) and `on` (UTC). Null when the date does not parse. */
export function ageOn(dobIso: string | null | undefined, on: Date = new Date()): number | null {
  if (!dobIso || !/^\d{4}-\d{2}-\d{2}/.test(dobIso)) return null;
  const dob = new Date(`${dobIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** True for a known date of birth under AGE_OF_MAJORITY. An unknown date is not treated as a minor. */
export function isMinorOn(dobIso: string | null | undefined, on: Date = new Date()): boolean {
  const age = ageOn(dobIso, on);
  return age !== null && age < AGE_OF_MAJORITY;
}

/** State a new funnel registration starts in. */
export function initialFunnelRegistrationState(
  dobIso: string | null | undefined,
  on: Date = new Date()
): Extract<RegistrationState, "pending_consent" | "pending_payment"> {
  return isMinorOn(dobIso, on) ? "pending_consent" : "pending_payment";
}

export const PARENTAL_CONSENT_TITLE = "Parental consent";

/** The words the guardian signs. Changing them creates a new document version on the next signature. */
export function parentalConsentText(input: {
  seasonName: string | null | undefined;
  orgName: string | null | undefined;
}): string {
  const season = input.seasonName?.trim() || "this season";
  const org = input.orgName?.trim() || "the league";
  return [
    `I am the parent or legal guardian of the player named on this registration, who is under ${AGE_OF_MAJORITY}.`,
    `I consent to them registering for ${season} with ${org} and taking part in its games, practices and events.`,
    `I understand the league's required waivers and code of conduct must be completed before the registration is submitted, and that the league may contact me about this registration.`
  ].join("\n\n");
}

/** A guardian's typed legal name: at least first and last name. */
export function guardianNameAcceptable(name: string | null | undefined): boolean {
  const parts = (name ?? "").trim().split(/\s+/).filter((p) => p.length > 0);
  return parts.length >= 2 && parts.join(" ").length >= 4;
}
