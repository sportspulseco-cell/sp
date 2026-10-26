"use client";

import { useEffect, useState } from "react";
import { schedulingInventory } from "@/lib/api/browser-api";
import { mapLimit } from "@sportspulse/api-client";

/** One bookable rink: a surface of a venue, with the venue's time zone. */
export interface RinkOption {
  surfaceId: string;
  /** "Venue · Surface", for pickers. */
  label: string;
  venueName: string;
  surfaceLabel: string;
  timezone: string;
}

/**
 * Rinks of an organization from the scheduling inventory (Rinks & ice
 * time), sorted by name. `rinks` is null while loading; [] when the org
 * has none (callers show where to add one). Shared by New game and
 * Reschedule so both offer the same list.
 */
export function useOrgRinks(orgId: string | null | undefined): {
  rinks: RinkOption[] | null;
  error: string | null;
} {
  const [rinks, setRinks] = useState<RinkOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setRinks([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setRinks(null);
    setError(null);
    (async () => {
      try {
        const venues = await schedulingInventory.listVenues({ orgId });
        // Six at a time, not one request per venue at once (CONSOLE-22).
        const details = await mapLimit(venues.items, 6, (v) => schedulingInventory.getVenue(v.id));
        const opts: RinkOption[] = details
          .flatMap((d) =>
            d.surfaces.map((s) => ({
              surfaceId: s.id,
              label: `${d.venue.name} · ${s.label}`,
              venueName: d.venue.name,
              surfaceLabel: s.label,
              timezone: d.venue.timezone
            }))
          )
          .sort((a, b) => a.label.localeCompare(b.label));
        if (!cancelled) setRinks(opts);
      } catch (err) {
        if (!cancelled) {
          setRinks([]);
          setError(`Could not load rinks: ${(err as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { rinks, error };
}
