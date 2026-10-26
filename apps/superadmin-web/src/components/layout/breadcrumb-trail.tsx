"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Breadcrumbs, isIdSegment, trailFromPath } from "@sportspulse/ui";
import { leagueMgmt, orgs, registration } from "@/lib/api/browser-api";
import { ALL_NAV_LINKS } from "./nav-config";

/**
 * Where an id in the path gets its name. Each read is the record's own
 * scope-checked GET, so a name the caller may not see comes back as a
 * 404 and the crumb stays "Details".
 */
const NAME_BY_SECTION: Record<string, (id: string) => Promise<{ name: string }>> = {
  organizations: async (id) => ({ name: (await orgs.get(id)).displayName }),
  leagues: (id) => leagueMgmt.getLeague(id),
  seasons: (id) => leagueMgmt.getSeason(id),
  divisions: (id) => leagueMgmt.getDivision(id),
  teams: (id) => leagueMgmt.getTeam(id),
  forms: (id) => registration.getForm(id)
};

const HOME = { href: "/dashboard", label: "Home" };

/** Clickable trail for the top bar: Home › section › record › sub-page. */
export function BreadcrumbTrail() {
  const pathname = usePathname() ?? "/";
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const parts = pathname.split("/").filter(Boolean);
    const wanted = parts
      .map((seg, i) => ({ id: seg, section: parts[i - 1] ?? "" }))
      .filter((p) => isIdSegment(p.id) && NAME_BY_SECTION[p.section] && names[p.id] === undefined);
    if (wanted.length === 0) return;
    let live = true;
    void Promise.all(
      wanted.map(async (w) => {
        try {
          const rec = await NAME_BY_SECTION[w.section]!(w.id);
          return [w.id, rec.name] as const;
        } catch {
          return [w.id, ""] as const; // not visible or gone: keep "Details"
        }
      })
    ).then((pairs) => {
      if (!live) return;
      setNames((prev) => {
        const next = { ...prev };
        for (const [id, name] of pairs) next[id] = name;
        return next;
      });
    });
    return () => {
      live = false;
    };
    // `names` is read only to skip ids already fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const items = useMemo(() => {
    const known = Object.fromEntries(Object.entries(names).filter(([, v]) => v));
    return trailFromPath(pathname === "/" ? HOME.href : pathname, ALL_NAV_LINKS, { home: HOME, names: known });
  }, [pathname, names]);

  return <Breadcrumbs items={items} />;
}
