import type { LucideIcon } from "lucide-react";
import type { NavLink, SiteMapGroup } from "../breadcrumbs";

/**
 * One nav model for every console. Each app keeps its own items (its
 * jobs, its labels) in a nav config; the shell renders them the same
 * way everywhere. The sidebar, the breadcrumb trail and the site map
 * all read this list, so a page has one name everywhere.
 */
export interface ShellNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface ShellNavSection {
  /** Group label. Omitted for the top group (Home and friends). */
  label?: string;
  items: ShellNavItem[];
  /**
   * Open on first paint even when no item in it is active. A section
   * that holds the active page is always open.
   */
  defaultOpen?: boolean;
}

/** Every link in the nav, for breadcrumb labels. */
export function navLinks(sections: ReadonlyArray<ShellNavSection>): NavLink[] {
  return sections.flatMap((s) => s.items.map((i) => ({ href: i.href, label: i.label })));
}

/** The nav as site-map groups. The unlabelled top group is `homeLabel`. */
export function navSiteMap(sections: ReadonlyArray<ShellNavSection>, homeLabel = "Home"): SiteMapGroup[] {
  return sections.map((s) => ({
    label: s.label ?? homeLabel,
    items: s.items.map((i) => ({ href: i.href, label: i.label }))
  }));
}

/**
 * The nav entry the path belongs to: an exact match, else the longest
 * entry the path sits under. The home entry ("/" or the app's home
 * href) matches only itself, so it is never active on every page.
 */
export function activeNavHref(
  pathname: string,
  sections: ReadonlyArray<ShellNavSection>,
  homeHref = "/"
): string | null {
  let best: string | null = null;
  for (const s of sections) {
    for (const { href } of s.items) {
      const hit =
        pathname === href ||
        (href !== "/" && href !== homeHref && pathname.startsWith(`${href}/`));
      if (hit && (best === null || href.length > best.length)) best = href;
    }
  }
  return best;
}

/**
 * True when `path` is a page of the app. `routes` are the app's page
 * patterns, e.g. "/teams/[id]"; a bracketed part matches any segment.
 */
export function isRoute(path: string, routes: ReadonlyArray<string>): boolean {
  const parts = path.split("/").filter(Boolean);
  return routes.some((r) => {
    const rp = r.split("/").filter(Boolean);
    return rp.length === parts.length && rp.every((seg, i) => /^\[.+\]$/.test(seg) || seg === parts[i]);
  });
}
