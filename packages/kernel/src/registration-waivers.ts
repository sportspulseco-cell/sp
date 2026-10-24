/**
 * Which documents must a registrant sign before a registration can be
 * submitted (REG-5)? One rule for the funnel, the player compliance page
 * and the API gate on pay.
 *
 * Sources, per document:
 *   - required: the season's toggle (Divisions & eligibility step), else
 *     the form's Waivers & documents toggle, else the kernel default
 *     (SEASON_CONFIG_DEFAULTS: liability waiver and code of conduct are
 *     required).
 *   - text: the season's text, else the form's text, else the SportsPulse
 *     default text (defaultWaiversConfig). An admin who leaves the text
 *     empty gets the default, as the setup screen promises; the waiver is
 *     never silently dropped.
 *
 * Org documents published under Compliance > Documents are a template
 * catalogue. Nothing binds them to a season, so they are not required
 * here.
 *
 * Photo release is optional and never blocks submission.
 */
import { defaultWaiversConfig, type FormWaiversConfig } from "./forms";
import { SEASON_CONFIG_DEFAULTS, type SeasonConfig } from "./season-config";

export const REGISTRATION_DOCUMENT_KEYS = [
  "liability_waiver",
  "code_of_conduct"
] as const;
export type RegistrationDocumentKey = (typeof REGISTRATION_DOCUMENT_KEYS)[number];

export function isRegistrationDocumentKey(v: unknown): v is RegistrationDocumentKey {
  return (
    typeof v === "string" &&
    (REGISTRATION_DOCUMENT_KEYS as readonly string[]).includes(v)
  );
}

export interface RegistrationDocumentRequirement {
  key: RegistrationDocumentKey;
  /** `documents.kind` the signature is filed under. */
  documentKind: "waiver" | "code_of_conduct";
  /** Player-facing name. */
  title: string;
  /** Body the registrant reads and signs. Never empty. */
  content: string;
  contentSource: "season" | "form" | "default";
  /**
   * typed_name: scroll to the end, type the full legal name.
   * acknowledge: one confirmation; the API records the signer's name.
   */
  signMode: "typed_name" | "acknowledge";
}

export interface ResolvedRegistrationWaivers {
  /** Every entry blocks submission until signed. */
  required: RegistrationDocumentRequirement[];
  photoRelease: { enabled: boolean; content: string };
}

type SeasonWaiverFields = Pick<
  SeasonConfig,
  | "requireLiabilityWaiver"
  | "requireCodeOfConduct"
  | "liabilityWaiverContent"
  | "codeOfConductContent"
>;

function pickText(...candidates: Array<string | null | undefined>): {
  text: string;
  index: number;
} {
  for (let i = 0; i < candidates.length; i++) {
    const t = candidates[i]?.trim();
    if (t) return { text: t, index: i };
  }
  return { text: "", index: -1 };
}

const SOURCES = ["season", "form", "default"] as const;

export function resolveRegistrationWaivers(
  seasonConfig: Partial<SeasonWaiverFields> | Record<string, unknown> | null | undefined,
  formWaivers: Partial<FormWaiversConfig> | null | undefined
): ResolvedRegistrationWaivers {
  const season = (seasonConfig ?? {}) as Partial<SeasonWaiverFields>;
  const form = formWaivers ?? {};
  const defaults = defaultWaiversConfig();

  const bool = (v: unknown): boolean | undefined =>
    typeof v === "boolean" ? v : undefined;

  const required: RegistrationDocumentRequirement[] = [];

  const liabilityOn =
    bool(season.requireLiabilityWaiver) ??
    bool(form.liabilityWaiver?.enabled) ??
    SEASON_CONFIG_DEFAULTS.requireLiabilityWaiver;
  if (liabilityOn) {
    const t = pickText(
      season.liabilityWaiverContent,
      form.liabilityWaiver?.content,
      defaults.liabilityWaiver.content
    );
    required.push({
      key: "liability_waiver",
      documentKind: "waiver",
      title: "Liability waiver",
      content: t.text,
      contentSource: SOURCES[t.index] ?? "default",
      signMode: "typed_name"
    });
  }

  const cocOn =
    bool(season.requireCodeOfConduct) ??
    bool(form.codeOfConduct?.enabled) ??
    SEASON_CONFIG_DEFAULTS.requireCodeOfConduct;
  if (cocOn) {
    const t = pickText(
      season.codeOfConductContent,
      form.codeOfConduct?.content,
      defaults.codeOfConduct.content
    );
    required.push({
      key: "code_of_conduct",
      documentKind: "code_of_conduct",
      title: "Code of conduct",
      content: t.text,
      contentSource: SOURCES[t.index] ?? "default",
      signMode: "acknowledge"
    });
  }

  const photoOn = bool(form.photoRelease?.enabled) ?? false;
  return {
    required,
    photoRelease: {
      enabled: photoOn,
      content: pickText(form.photoRelease?.content, defaults.photoRelease.content).text
    }
  };
}

/**
 * Typed-signature check: the typed name must equal the signer's name,
 * ignoring case and repeated spaces. Used by the funnel button and by
 * the API before it stores a signature.
 */
export function signatureNameMatches(typed: string, expected: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const e = norm(expected ?? "");
  return e.length > 0 && norm(typed ?? "") === e;
}
