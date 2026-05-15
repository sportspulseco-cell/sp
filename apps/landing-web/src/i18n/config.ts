/**
 * Backlog #13 — i18n scaffold for landing-web.
 *
 * Strategy: cookie-driven locale (NEXT_LOCALE) read by next-intl's
 * `getRequestConfig`. No URL prefix yet — `/`, `/pricing`, etc stay
 * canonical English; switching locale flips a cookie + reloads.
 * Graduating to URL-based locales (`/es/pricing`) lands when a real
 * second-locale rollout begins; until then this keeps every existing
 * route working untouched.
 *
 * Adding a locale: drop a `messages/<code>.json` mirroring `en.json`,
 * extend LOCALES, and the picker auto-includes it.
 */

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español"
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
