import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./lib/cn";

/**
 * Breadcrumb trail and site map (FR-3.12.2, NFR-6.5.4). Every console
 * builds both from the nav list its sidebar shows, so a page's crumb
 * label is the same words as its sidebar entry and the site map lists
 * exactly what the role can open.
 */

export interface Crumb {
  label: string;
  /** Omitted for the current page and for path parts that are not pages. */
  href?: string;
}

export interface NavLink {
  href: string;
  label: string;
}

const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isIdSegment(segment: string): boolean {
  return ID_SEGMENT.test(segment);
}

function humanize(segment: string): string {
  const s = decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : segment;
}

/**
 * The trail for a path, following the path the person clicked:
 * Home › <sidebar label> › <record name> › <sub-page>.
 * - A path that is a sidebar entry takes the sidebar's label and links.
 * - An id takes its name from `names` (else "Details") and links, since
 *   /section/:id is a page in every console.
 * - Other parts are labelled from the URL and link only when they are a
 *   known page (`pages`), so the trail never links to a 404.
 */
export function trailFromPath(
  pathname: string,
  nav: ReadonlyArray<NavLink>,
  opts: { home: NavLink; names?: Record<string, string>; pages?: ReadonlySet<string> } = {
    home: { href: "/", label: "Home" }
  }
): Crumb[] {
  const clean = pathname.split("?")[0]!.replace(/\/+$/, "") || "/";
  const byHref = new Map(nav.map((n) => [n.href, n.label]));
  const crumbs: Crumb[] = [{ label: opts.home.label, href: opts.home.href }];
  if (clean === "/" || clean === opts.home.href) return [{ label: opts.home.label }];
  const parts = clean.split("/").filter(Boolean);
  let path = "";
  parts.forEach((segment) => {
    path += `/${segment}`;
    const navLabel = byHref.get(path);
    if (navLabel) crumbs.push({ label: navLabel, href: path });
    else if (isIdSegment(segment)) crumbs.push({ label: opts.names?.[segment] ?? "Details", href: path });
    else crumbs.push({ label: humanize(segment), href: opts.pages?.has(path) ? path : undefined });
  });
  const last = crumbs[crumbs.length - 1]!;
  crumbs[crumbs.length - 1] = { label: last.label };
  return crumbs;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-[12px] text-fg-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${c.label}`} className={cn("flex min-w-0 items-center gap-1", !last && "shrink-0")}>
              {i > 0 ? <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-fg-subtle" /> : null}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-fg">
                  {c.label}
                </span>
              ) : c.href ? (
                <Link href={c.href} className="max-w-[16ch] truncate transition-colors hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span className="max-w-[16ch] truncate">{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface SiteMapGroup {
  label: string;
  items: NavLink[];
}

/** Every page the role can open, grouped as in the sidebar. */
export function SiteMap({ groups }: { groups: SiteMapGroup[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.label} className="rounded-xl border border-border bg-surface-1 p-4">
            <h2 className="text-[13px] font-semibold text-fg">{g.label}</h2>
            <ul className="mt-2 space-y-1">
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className="text-[13px] text-fg-muted underline-offset-2 hover:text-fg hover:underline">
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
