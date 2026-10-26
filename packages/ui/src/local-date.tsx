"use client";

import { useCallback, useEffect, useState } from "react";
import { DATE_FORMATS, type DateFormat } from "@sportspulse/kernel";

/**
 * When something happened, in the reader's own time zone. The server
 * cannot know that zone, so the first render (server and browser alike)
 * uses UTC and the browser switches to local time once mounted; the two
 * never disagree during hydration.
 *
 * - Calendar dates (a season's start, a due date, a birthday): use
 *   formatCalendarDate from @sportspulse/kernel instead.
 * - Game and slot times: use formatInZone with the rink's zone.
 *
 * `format` picks one of the shared shapes (DATE_FORMATS): "date" (the
 * default, "Nov 22, 2026"), "dateTime", "monthDay" or "time".
 */
export function LocalDate({
  iso,
  format,
  options,
  fallback = ""
}: {
  iso: string | Date | null | undefined;
  format?: DateFormat;
  /** Escape hatch; prefer `format`. */
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}) {
  const fmt = useLocalDate();
  const text = fmt(iso, format ?? options);
  if (!text) return <>{fallback}</>;
  const dateTime = typeof iso === "string" ? iso : iso instanceof Date ? iso.toISOString() : undefined;
  return <time dateTime={dateTime}>{text}</time>;
}

/**
 * The same formatting as LocalDate, as a function, for places that need a
 * string (a title attribute, a sentence, a select option). Hydration-safe
 * in the same way: UTC on the first render, the reader's zone after.
 */
export function useLocalDate(): (
  iso: string | Date | null | undefined,
  format?: DateFormat | Intl.DateTimeFormatOptions
) => string {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  return useCallback(
    (iso, format = "date") => {
      if (!iso) return "";
      const d = iso instanceof Date ? iso : new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const opts: Intl.DateTimeFormatOptions = typeof format === "string" ? DATE_FORMATS[format] : format;
      return new Intl.DateTimeFormat("en-US", local ? opts : { ...opts, timeZone: "UTC" }).format(d);
    },
    [local]
  );
}
