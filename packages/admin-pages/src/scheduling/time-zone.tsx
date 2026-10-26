"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatInZone, GAME_TIME_WITH_ZONE, isValidTimeZone, zonedWallTimeToUtc } from "@sportspulse/kernel";

const ScheduleZone = createContext<string | null>(null);

/**
 * The season's time zone for the scheduling views below it. Game and slot
 * times are shown as the rink's clocks read them (SCH-28), the same on the
 * server and in every browser; without a zone they say UTC.
 */
export function ScheduleTimeZoneProvider({ timeZone, children }: { timeZone: string | null | undefined; children: ReactNode }) {
  return <ScheduleZone.Provider value={timeZone ?? null}>{children}</ScheduleZone.Provider>;
}

/** The season's zone, or null when none was given (times then say UTC). */
export function useScheduleTimeZone(): string | null {
  return useContext(ScheduleZone);
}

/**
 * Reads a datetime-local value ("2026-11-04T21:00") as the rink's clock in
 * the season's zone, not the browser's, so what the admin types matches
 * what every view shows. Without a valid zone it is read as UTC, which
 * the views also say. Also returns a hint naming the zone for the field.
 */
export function useWallTimeToUtc(): { toUtc: (local: string) => string | undefined; hint: string } {
  const timeZone = useContext(ScheduleZone);
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
  return {
    toUtc: (local) => (local ? zonedWallTimeToUtc(local, zone).toISOString() : undefined),
    hint: `Rink time (${zone})`
  };
}

/**
 * Formats a game or slot time in the season's zone: "Nov 4, 9:00 PM", or
 * "Nov 4, 9:00 PM EST" with `withZone` (views with no zone line beside
 * the times, such as the playoff bracket).
 */
export function useSlotTime(opts: { withZone?: boolean } = {}): (iso: string | null | undefined) => string {
  const timeZone = useContext(ScheduleZone);
  const format = opts.withZone ? GAME_TIME_WITH_ZONE : undefined;
  return (iso) => (iso ? formatInZone(iso, timeZone, format) || "—" : "—");
}
