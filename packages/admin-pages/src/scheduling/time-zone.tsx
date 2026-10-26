"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatInZone } from "@sportspulse/kernel";

const ScheduleZone = createContext<string | null>(null);

/**
 * The season's time zone for the scheduling views below it. Game and slot
 * times are shown as the rink's clocks read them (SCH-28), the same on the
 * server and in every browser; without a zone they say UTC.
 */
export function ScheduleTimeZoneProvider({ timeZone, children }: { timeZone: string | null | undefined; children: ReactNode }) {
  return <ScheduleZone.Provider value={timeZone ?? null}>{children}</ScheduleZone.Provider>;
}

/** Formats a game or slot time in the season's zone: "Nov 4, 9:00 PM". */
export function useSlotTime(): (iso: string | null | undefined) => string {
  const timeZone = useContext(ScheduleZone);
  return (iso) => (iso ? formatInZone(iso, timeZone) || "—" : "—");
}
