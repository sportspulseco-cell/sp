/**
 * UC-29 / FR-3.15.5: read the PDF417 barcode on the back of a US or
 * Canadian driver's licence or ID card (AAMVA DL/ID Card Design
 * Standard, versions 1 to 10) and compare it with the person on file.
 *
 * The decoder in the browser turns the barcode into text; this parser
 * turns the text into fields; the API runs both the parser and the
 * comparison again on the server, so the browser never decides a match.
 *
 * What the barcode proves: the card carries these printed fields. It
 * does not prove the card is genuine (barcodes can be printed) or that
 * the person holding it is the person on the card. The admin still
 * looks at the card and decides.
 */

export type AamvaDocumentType = "DL" | "ID";

export interface AamvaLicence {
  /** AAMVA standard version from the header (0 = pre-standard). */
  version: number | null;
  /** Issuer identification number (6 digits) from the header. */
  iin: string | null;
  documentType: AamvaDocumentType;
  /** DAQ. Never stored in clear: the API keeps the last 4 and a keyed hash. */
  licenceNumber: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  /** DDE/DDF/DDG: the card printed a truncated name. */
  lastNameTruncated: boolean;
  firstNameTruncated: boolean;
  /** YYYY-MM-DD, or null when the field is missing or unreadable. */
  dateOfBirth: string | null;
  expiresOn: string | null;
  issuedOn: string | null;
  /** DAJ: state or province code, e.g. "NY", "ON". */
  jurisdiction: string | null;
  /** DCG: "USA" or "CAN" when present. */
  country: string | null;
}

export type AamvaParseResult =
  | { ok: true; licence: AamvaLicence }
  | { ok: false; reason: "empty" | "not_aamva" | "no_licence_number"; message: string };

/** Header: "@" LF RS CR, then "ANSI " (or "AAMVA"), IIN, version, ... */
const HEADER = /@\s*[\n\x1e\r]*\s*(?:ANSI ?|AAMVA)(\d{6})(\d{2})(\d{2})?(\d{2})?/;

/** Issuer numbers of Canadian provinces and territories (AAMVA IIN list). */
const CANADA_IIN = new Set([
  "604426", "604427", "604428", "604429", "604430", "604431", "604432", "604433",
  "636012", "636013", "636016", "636017", "636028", "636044", "636048"
]);

const CANADA_JURISDICTIONS = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);

/**
 * Parse the decoded barcode text. Tolerant of what phone and webcam
 * decoders do to the control characters: elements may be separated by
 * LF, CR, RS or a mix, and the first element follows the "DL"/"ID"
 * subfile type on the same line.
 */
export function parseAamva(text: string | null | undefined): AamvaParseResult {
  const raw = (text ?? "").replace(/\u0000/g, "");
  if (!raw.trim()) return { ok: false, reason: "empty", message: "The barcode was empty." };

  const header = HEADER.exec(raw);
  const iin = header?.[1] ?? null;
  const version = header ? Number(header[2]) : null;

  // Elements: three letters (D.. for AAMVA, Z.. for jurisdiction fields)
  // at the start of a segment. The first segment also carries the
  // subfile designators, so look for "DL" or "ID" followed by an element.
  const elements = new Map<string, string>();
  let documentType: AamvaDocumentType | null = null;
  const segments = raw.split(/[\n\r\x1e]+/);
  for (let seg of segments) {
    seg = seg.trim();
    if (!seg) continue;
    // "...DL00410278ZC03190024DLDAQ123" -> the last "DLD" / "IDD" starts data.
    // Element codes are DA., DB., DC., DD.: "DLD.." is never one.
    if (!/^D[A-D][A-Z]/.test(seg)) {
      const start = Math.max(seg.lastIndexOf("DLD"), seg.lastIndexOf("IDD"));
      if (start < 0) continue;
      documentType = seg.slice(start, start + 2) as AamvaDocumentType;
      seg = seg.slice(start + 2);
    }
    const m = /^(D[A-D][A-Z])(.*)$/.exec(seg);
    if (!m) continue;
    const code = m[1]!;
    if (!elements.has(code)) elements.set(code, m[2]!.trim());
  }

  if (elements.size === 0) {
    return {
      ok: false,
      reason: "not_aamva",
      message: "This barcode is not a driver's licence or ID card barcode."
    };
  }

  const licenceNumber = (elements.get("DAQ") ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!licenceNumber) {
    return { ok: false, reason: "no_licence_number", message: "The barcode has no licence number." };
  }

  // Names. v2+: DCS family, DAC (v3+) or DCT (v2) given, DAD middle.
  // v1: DAB family, DAC given; or DAA "LAST,FIRST,MIDDLE".
  let lastName = clean(elements.get("DCS") ?? elements.get("DAB"));
  let firstName = clean(elements.get("DAC") ?? null);
  let middleName = clean(elements.get("DAD") ?? null);
  const dct = clean(elements.get("DCT") ?? null);
  if (!firstName && dct) {
    // v2 packs given names into DCT, separated by commas or spaces.
    const parts = dct.split(/[,\s]+/).filter(Boolean);
    firstName = parts[0] ?? null;
    middleName = middleName ?? (parts.slice(1).join(" ") || null);
  }
  const daa = elements.get("DAA");
  if ((!lastName || !firstName) && daa) {
    const parts = daa.split(/[,$]/).map((p) => p.trim()).filter(Boolean);
    lastName = lastName ?? clean(parts[0] ?? null);
    firstName = firstName ?? clean(parts[1] ?? null);
    middleName = middleName ?? clean(parts.slice(2).join(" ") || null);
  }

  const jurisdiction = clean(elements.get("DAJ") ?? null)?.toUpperCase() ?? null;
  const countryRaw = clean(elements.get("DCG") ?? null)?.toUpperCase() ?? null;
  const canadian =
    countryRaw === "CAN" ||
    (countryRaw === null && ((iin !== null && CANADA_IIN.has(iin)) || (jurisdiction !== null && CANADA_JURISDICTIONS.has(jurisdiction))));
  // Version 1 cards wrote CCYYMMDD everywhere; later US cards use MMDDCCYY.
  const order: DateOrder = canadian || version === 1 ? "ymd" : "mdy";

  return {
    ok: true,
    licence: {
      version,
      iin,
      documentType: documentType ?? "DL",
      licenceNumber,
      firstName,
      middleName,
      lastName,
      lastNameTruncated: (elements.get("DDE") ?? "").toUpperCase() === "T",
      firstNameTruncated: (elements.get("DDF") ?? "").toUpperCase() === "T",
      dateOfBirth: parseAamvaDate(elements.get("DBB"), order),
      expiresOn: parseAamvaDate(elements.get("DBA"), order),
      issuedOn: parseAamvaDate(elements.get("DBD"), order),
      jurisdiction,
      country: countryRaw ?? (canadian ? "CAN" : jurisdiction ? "USA" : null)
    }
  };
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t || /^(NONE|UNAVL|UNAVAILABLE)$/i.test(t)) return null;
  return t;
}

type DateOrder = "mdy" | "ymd";

/**
 * AAMVA dates are 8 digits: MMDDCCYY on US cards, CCYYMMDD on Canadian
 * and version-1 cards. The expected order is tried first; the other only
 * when the first is not a real date (years are limited to 1900-2099, so
 * the two readings never both fit).
 */
export function parseAamvaDate(v: string | null | undefined, prefer: DateOrder = "mdy"): string | null {
  const d = (v ?? "").trim();
  if (!/^\d{8}$/.test(d)) return null;
  const mdy = toIso(d.slice(4, 8), d.slice(0, 2), d.slice(2, 4));
  const ymd = toIso(d.slice(0, 4), d.slice(4, 6), d.slice(6, 8));
  return prefer === "mdy" ? mdy ?? ymd : ymd ?? mdy;
}

function toIso(y: string, m: string, d: string): string | null {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 1900 || year > 2099 || month < 1 || month > 12 || day < 1) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${y}-${m}-${d}`;
}

/** Fields a licence check can flag. Stored on the evidence row. */
export const LICENCE_CHECK_FIELDS = [
  "last_name",
  "first_name",
  "date_of_birth",
  "date_of_birth_not_on_file",
  "expired",
  "expiry_unreadable",
  "seen_on_another_person"
] as const;
export type LicenceCheckField = (typeof LICENCE_CHECK_FIELDS)[number];

export const LICENCE_CHECK_FIELD_LABELS: Record<LicenceCheckField, string> = {
  last_name: "Last name does not match",
  first_name: "First name does not match",
  date_of_birth: "Date of birth does not match",
  date_of_birth_not_on_file: "No date of birth on file to compare",
  expired: "Licence has expired",
  expiry_unreadable: "Expiry date could not be read",
  seen_on_another_person: "This licence was already checked for another person"
};

export const LICENCE_CHECK_RESULTS = ["match", "mismatch"] as const;
export type LicenceCheckResult = (typeof LICENCE_CHECK_RESULTS)[number];

export const LICENCE_CHECK_METHODS = ["camera", "photo"] as const;
export type LicenceCheckMethod = (typeof LICENCE_CHECK_METHODS)[number];

export interface LicencePersonOnFile {
  legalFirstName: string;
  legalLastName: string;
  preferredName?: string | null;
  /** YYYY-MM-DD or null. */
  dobDate: string | null;
}

/** Upper case, accents dropped, letters only: "O'Brien-Smith" -> "OBRIENSMITH". */
export function normalizeNameForMatch(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function nameMatches(
  onCard: string | null,
  onFile: Array<string | null | undefined>,
  truncated: boolean,
  firstWordOk: boolean
): boolean {
  const card = normalizeNameForMatch(onCard);
  if (!card) return false;
  return onFile.some((f) => {
    const file = normalizeNameForMatch(f);
    if (!file) return false;
    if (file === card) return true;
    // A truncated name on the card matches the start of the full name.
    if (truncated && file.startsWith(card)) return true;
    if (!firstWordOk) return false;
    // Given names only: "MARY ANN" on file, "MARY" on the card (or the reverse).
    const firstWord = (s: string | null | undefined) => normalizeNameForMatch((s ?? "").trim().split(/\s+/)[0]);
    return firstWord(onCard) !== "" && firstWord(onCard) === firstWord(f);
  });
}

/**
 * Compare a parsed licence with the person on file. `today` is
 * YYYY-MM-DD in the league's calendar (the API passes the UTC date).
 * A licence that expires today is still valid today.
 */
export function compareLicenceToPerson(
  licence: AamvaLicence,
  person: LicencePersonOnFile,
  today: string
): { result: LicenceCheckResult; mismatchedFields: LicenceCheckField[] } {
  const fields: LicenceCheckField[] = [];
  if (!nameMatches(licence.lastName, [person.legalLastName], licence.lastNameTruncated, false)) fields.push("last_name");
  if (
    !nameMatches(licence.firstName, [person.legalFirstName, person.preferredName], licence.firstNameTruncated, true)
  ) {
    fields.push("first_name");
  }
  if (!person.dobDate) fields.push("date_of_birth_not_on_file");
  else if (licence.dateOfBirth !== person.dobDate) fields.push("date_of_birth");
  if (!licence.expiresOn) fields.push("expiry_unreadable");
  else if (licence.expiresOn < today) fields.push("expired");
  return { result: fields.length === 0 ? "match" : "mismatch", mismatchedFields: fields };
}

/** Last four characters of the licence number: all that is kept in clear. */
export function licenceLast4(licenceNumber: string): string {
  return licenceNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-4);
}
