"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  type Locale
} from "@/i18n/config";

/**
 * Backlog #13 — minimal locale switcher. Writes NEXT_LOCALE as a
 * 1-year cookie and reloads so the server-side `getRequestConfig`
 * re-resolves on the next request.
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale_picker");
  const current = useLocale();

  function setLocale(next: Locale) {
    if (typeof document === "undefined") return;
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${oneYear}; samesite=lax`;
    window.location.reload();
  }

  return (
    <label className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
      <Globe className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{t("label")}</span>
      <select
        value={current}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="cursor-pointer rounded-md border border-border bg-surface-1 px-2 py-1 text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted focus-visible:outline-none focus-visible:shadow-focus"
        aria-label={t("label")}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
