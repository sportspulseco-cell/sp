/**
 * Wall-clock time in an IANA time zone <-> UTC instant. Games and ice
 * slots are stored in UTC with the rink's zone beside them; admins type
 * rink-local times. The server converts, so the result never depends on
 * the browser's zone. Unit tests: time-zones.test.ts.
 */

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function wallParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour") % 24,
    mi: get("minute")
  };
}

/** Offset of `timeZone` from UTC at `instant`, in ms (east positive). */
function offsetMs(instant: number, timeZone: string): number {
  const p = wallParts(instant, timeZone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/** "YYYY-MM-DDTHH:MM" (an <input type="datetime-local"> value) for `instant` in `timeZone`. */
export function utcToZonedWallTime(instant: Date | string, timeZone: string): string {
  const t = typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  const p = wallParts(t, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/**
 * The UTC instant at which the clocks in `timeZone` read `local`
 * ("YYYY-MM-DDTHH:MM"). When the clocks go back and the time happens
 * twice, the earlier instant wins. When the clocks go forward and the
 * time never happens, the result is pushed forward by the gap (02:30 on
 * a spring-forward night becomes 03:30), as calendar apps do.
 * Throws on a malformed time or unknown zone.
 */
export function zonedWallTimeToUtc(local: string, timeZone: string): Date {
  const m = WALL.exec(local);
  if (!m) throw new RangeError(`Expected YYYY-MM-DDTHH:MM, got "${local}"`);
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown time zone "${timeZone}"`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    h > 23 ||
    mi > 59
  ) {
    throw new RangeError(`Not a real date and time: "${local}"`);
  }
  const first = asUtc - offsetMs(asUtc, timeZone);
  const second = asUtc - offsetMs(first, timeZone);
  const matches = (t: number) => utcToZonedWallTime(new Date(t), timeZone) === local;
  const candidates = [first, second].filter(matches).sort((a, b) => a - b);
  return new Date(candidates[0] ?? first);
}

const GAME_TIME: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
};

/**
 * A game time with the zone's short name: "Nov 4, 9:00 PM EST". For views
 * that show times with no zone line beside them (the playoff bracket).
 */
export const GAME_TIME_WITH_ZONE: Intl.DateTimeFormatOptions = {
  ...GAME_TIME,
  timeZoneName: "short"
};

/**
 * `instant` as the clocks read in `timeZone` ("Nov 4, 9:00 PM"). Game and
 * slot times are shown in the rink's zone, so the text is the same on the
 * server and in every browser. An unknown or missing zone shows UTC and
 * says so, rather than guessing (once: with `timeZoneName` the text
 * already ends in "UTC").
 */
export function formatInZone(
  instant: Date | string,
  timeZone: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = GAME_TIME
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "";
  if (timeZone && isValidTimeZone(timeZone)) {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(d);
  }
  const utc = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(d);
  return opts.timeZoneName ? utc : `${utc} UTC`;
}

const CALENDAR_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/**
 * A calendar date ("2026-11-22", or that day at midnight UTC) as written:
 * "Nov 22, 2026" for every reader. Parsing a date-only value and printing
 * it in the browser's zone showed the day before for anyone west of UTC
 * (a season starting Nov 22 read "Nov 21"), and differed between server
 * and browser.
 */
export function formatCalendarDate(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = CALENDAR_DATE
): string {
  if (!value) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(d);
}
