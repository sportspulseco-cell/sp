/**
 * Phone numbers for text messages (FR-3.10.2, FR-3.17.1). Every number
 * an SMS goes to is stored and sent in E.164 (`+` country code, then the
 * subscriber number, 8 to 15 digits). This is the one normaliser: the
 * API runs it when a person saves a number and again before each send.
 *
 * It checks shape, not ownership: a well-formed number can still belong
 * to someone else or be a landline. The provider's answer is the only
 * proof a message arrived.
 */

/** Countries whose numbers can be typed without the `+` prefix. */
export const PHONE_DEFAULT_COUNTRIES = ["US", "CA", "GB", "IE", "AU", "NZ", "DE", "FR", "SE", "FI", "CH", "IN"] as const;
export type PhoneDefaultCountry = (typeof PHONE_DEFAULT_COUNTRIES)[number];

/** Calling code and national-number length for each typed-without-`+` country. */
const NATIONAL: Record<PhoneDefaultCountry, { code: string; trunkZero: boolean; min: number; max: number }> = {
  US: { code: "1", trunkZero: false, min: 10, max: 10 },
  CA: { code: "1", trunkZero: false, min: 10, max: 10 },
  GB: { code: "44", trunkZero: true, min: 9, max: 10 },
  IE: { code: "353", trunkZero: true, min: 7, max: 9 },
  AU: { code: "61", trunkZero: true, min: 9, max: 9 },
  NZ: { code: "64", trunkZero: true, min: 8, max: 10 },
  DE: { code: "49", trunkZero: true, min: 6, max: 13 },
  FR: { code: "33", trunkZero: true, min: 9, max: 9 },
  SE: { code: "46", trunkZero: true, min: 7, max: 10 },
  FI: { code: "358", trunkZero: true, min: 5, max: 11 },
  CH: { code: "41", trunkZero: true, min: 9, max: 9 },
  IN: { code: "91", trunkZero: true, min: 10, max: 10 }
};

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "empty" | "invalid" | "extension" | "needs_country_code"; message: string };

const NANP_SUBSCRIBER = /^[2-9]\d{2}[2-9]\d{6}$/;

/**
 * Normalise what a person typed to E.164.
 *
 *   "(415) 555-2671"     -> +14155552671   (US default)
 *   "+44 20 7946 0958"   -> +442079460958
 *   "0044 20 7946 0958"  -> +442079460958
 *   "020 7946 0958", GB  -> +442079460958
 *
 * Refused: letters, extensions ("x12", "ext. 4"), wrong lengths, North
 * American numbers whose area code or exchange starts with 0 or 1, and
 * numbers without a `+` when the default country is not one we know.
 */
export function normalizePhoneE164(
  input: string | null | undefined,
  defaultCountry: string | null | undefined = "US"
): PhoneNormalizeResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "empty", message: "Enter a mobile number." };
  if (/(?:ext\.?|x|#)\s*\d+\s*$/i.test(raw) && /[a-z#]/i.test(raw)) {
    return { ok: false, reason: "extension", message: "Text messages cannot go to an extension. Enter a mobile number." };
  }
  if (!/^[+\d\s().\-/]+$/.test(raw)) {
    return { ok: false, reason: "invalid", message: "Use digits only, with an optional + at the start." };
  }
  // A + anywhere but the start is a typo, not a prefix.
  if (raw.indexOf("+") > 0) {
    return { ok: false, reason: "invalid", message: "Put the + only at the start of the number." };
  }
  let digits = raw.replace(/\D/g, "");
  let international = raw.startsWith("+");
  if (!international && digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }

  if (international) return checkInternational(digits);

  const country = (defaultCountry ?? "").toUpperCase() as PhoneDefaultCountry;
  const rule = NATIONAL[country];
  if (!rule) {
    return {
      ok: false,
      reason: "needs_country_code",
      message: "Start the number with + and the country code."
    };
  }
  if (rule.code === "1") {
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (!NANP_SUBSCRIBER.test(digits)) {
      return { ok: false, reason: "invalid", message: "Enter a 10-digit number with the area code." };
    }
    return { ok: true, e164: `+1${digits}` };
  }
  if (rule.trunkZero && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length < rule.min || digits.length > rule.max || digits.startsWith("0")) {
    return { ok: false, reason: "invalid", message: "That number is too short or too long." };
  }
  return checkInternational(rule.code + digits);
}

function checkInternational(digits: string): PhoneNormalizeResult {
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) {
    return { ok: false, reason: "invalid", message: "That number is too short or too long." };
  }
  if (digits.startsWith("1")) {
    const national = digits.slice(1);
    if (!NANP_SUBSCRIBER.test(national)) {
      return { ok: false, reason: "invalid", message: "Enter a 10-digit number with the area code after +1." };
    }
  }
  return { ok: true, e164: `+${digits}` };
}

/** True for a string already in E.164 shape. */
export function isE164(value: string | null | undefined): boolean {
  return !!value && /^\+[1-9]\d{7,14}$/.test(value);
}

/** "+1 ••• ••• 2671": what the UI shows of a saved number. */
export function maskPhoneE164(e164: string): string {
  if (!isE164(e164)) return "";
  return `${e164.slice(0, e164.length - 4).replace(/\d/g, "•")}${e164.slice(-4)}`;
}

/** Longest text body we send: two GSM-7 segments. */
export const SMS_MAX_CHARS = 306;

/**
 * The text of one SMS from a notice's subject and body: the subject,
 * then the body on one line, cut at a word to SMS_MAX_CHARS with "...".
 * HTML tags and repeated whitespace are dropped.
 */
export function smsText(subject: string | null | undefined, body: string, max = SMS_MAX_CHARS): string {
  const clean = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const head = subject ? clean(subject) : "";
  const text = clean(body);
  const joined = head && !text.startsWith(head) ? `${head}: ${text}` : text || head;
  if (joined.length <= max) return joined;
  const cut = joined.slice(0, max - 3);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).trimEnd()}...`;
}
