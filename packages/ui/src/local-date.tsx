"use client";

import { useEffect, useState } from "react";

/**
 * When something happened, in the reader's own time zone. The server
 * cannot know that zone, so the first render (server and browser alike)
 * uses UTC and the browser switches to local time once mounted; the two
 * never disagree during hydration. For calendar dates (a season's start,
 * a birthday) use formatCalendarDate from @sportspulse/kernel instead.
 */
export function LocalDate({
  iso,
  options = { month: "short", day: "numeric", year: "numeric" },
  fallback = ""
}: {
  iso: string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  if (!iso) return <>{fallback}</>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <>{fallback}</>;
  const text = new Intl.DateTimeFormat("en-US", local ? options : { ...options, timeZone: "UTC" }).format(d);
  return <time dateTime={iso}>{text}</time>;
}
