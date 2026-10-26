"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";
import { isIdSegment, type Crumb, type NavLink } from "../breadcrumbs";
import { isRoute } from "./nav";
import { useNav } from "./nav-context";

function humanize(segment: string): string {
  const s = decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : segment;
}

/**
 * The trail above a page: Home › section › record. It stops at the
 * parent, because the page's own title names the current page; the
 * same words never appear twice (crumb and title).
 *
 * - A path that is a sidebar entry takes the sidebar's label.
 * - An id takes the record's name when the page or `resolveName`
 *   supplied it, else "Details".
 * - Other parts appear only when they are a page of the app
 *   (`routes`), so the trail never links to a 404 or shows a folder
 *   name like "captain".
 * - The home page shows "Home" alone.
 */
export function shellTrail(
  pathname: string,
  opts: {
    nav: ReadonlyArray<NavLink>;
    home: NavLink;
    routes: ReadonlyArray<string>;
    names?: Record<string, string>;
  }
): Crumb[] {
  const clean = pathname.split("?")[0]!.replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === opts.home.href) return [{ label: opts.home.label }];
  const byHref = new Map(opts.nav.map((n) => [n.href, n.label]));
  const crumbs: Crumb[] = [{ label: opts.home.label, href: opts.home.href }];
  const parts = clean.split("/").filter(Boolean);
  let path = "";
  parts.slice(0, -1).forEach((segment) => {
    path += `/${segment}`;
    const navLabel = byHref.get(path);
    if (navLabel) {
      if (path !== opts.home.href) crumbs.push({ label: navLabel, href: path });
    } else if (isIdSegment(segment)) {
      crumbs.push({
        label: opts.names?.[segment] ?? "Details",
        href: isRoute(path, opts.routes) ? path : undefined
      });
    } else if (isRoute(path, opts.routes)) {
      crumbs.push({ label: humanize(segment), href: path });
    }
  });
  return crumbs;
}

/**
 * The trail for the current URL, rendered in the top bar of every
 * console. Wide screens show the whole trail; phones show a single
 * back link to the parent.
 */
export function ShellBreadcrumbs({
  nav,
  home,
  routes,
  resolveName
}: {
  nav: ReadonlyArray<NavLink>;
  home: NavLink;
  routes: ReadonlyArray<string>;
  /**
   * Optional lookup for ids the page did not name, e.g. the record's
   * scope-checked GET. Return null when the caller may not see it.
   */
  resolveName?: (section: string, id: string) => Promise<string | null>;
}) {
  const pathname = usePathname() ?? "/";
  const { names, setName } = useNav();
  const [tried, setTried] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!resolveName) return;
    const parts = pathname.split("/").filter(Boolean);
    const wanted = parts
      .slice(0, -1)
      .map((id, i) => ({ id, section: parts[i - 1] ?? "" }))
      .filter((p) => isIdSegment(p.id) && !names[p.id] && !tried[p.id]);
    if (wanted.length === 0) return;
    let live = true;
    setTried((prev) => ({ ...prev, ...Object.fromEntries(wanted.map((w) => [w.id, true as const])) }));
    for (const w of wanted) {
      resolveName(w.section, w.id)
        .then((name) => {
          if (live && name) setName(w.id, name);
        })
        .catch(() => {
          // Not visible to this role, or gone: the crumb stays "Details".
        });
    }
    return () => {
      live = false;
    };
    // `names` and `tried` are read only to skip ids already known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, resolveName]);

  const items = useMemo(
    () => shellTrail(pathname, { nav, home, routes, names }),
    [pathname, nav, home, routes, names]
  );

  const parent = items.length > 1 ? [...items].reverse().find((c) => c.href) : undefined;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      {/* Phone: one back link to the parent page. */}
      {parent ? (
        <Link
          href={parent.href!}
          className="inline-flex max-w-full items-center gap-1 text-[12px] text-fg-muted transition-colors hover:text-fg sm:hidden"
        >
          <ChevronLeft aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{parent.label}</span>
        </Link>
      ) : null}
      <ol className={cn("min-w-0 items-center gap-1 text-[12px] text-fg-muted", parent ? "hidden sm:flex" : "flex")}>
        {items.map((c, i) => (
          <li key={`${i}-${c.label}`} className={cn("flex min-w-0 items-center gap-1", i < items.length - 1 && "shrink-0")}>
            {i > 0 ? <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-fg-subtle" /> : null}
            {c.href ? (
              <Link href={c.href} className="max-w-[20ch] truncate transition-colors hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span aria-current={items.length === 1 ? "page" : undefined} className="max-w-[20ch] truncate">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
