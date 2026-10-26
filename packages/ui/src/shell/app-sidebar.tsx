"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { activeNavHref, type ShellNavItem, type ShellNavSection } from "./nav";
import { useNav } from "./nav-context";

export interface ShellBrand {
  /** Product name, e.g. "SportsPulse". */
  name: string;
  /** Which console this is, e.g. "Team admin". */
  console: string;
  icon: LucideIcon;
}

/**
 * The console sidebar: a sticky rail on wide screens, a slide-out
 * drawer on phones. Every console renders the same rail; only the
 * brand line and the nav items differ.
 */
export function AppSidebar({
  brand,
  sections,
  homeHref = "/",
  top,
  siteMapHref
}: {
  brand: ShellBrand;
  sections: ReadonlyArray<ShellNavSection>;
  homeHref?: string;
  /** Pinned above the nav, e.g. a registration call-to-action. */
  top?: ReactNode;
  /** Adds a "Site map" link to the footer. */
  siteMapHref?: string;
}) {
  const { open, setOpen } = useNav();

  return (
    <>
      {/* Wide screens: sticky rail */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex">
        <div className="border-b border-border px-3 py-3">
          <Brand brand={brand} />
        </div>
        {top}
        <LayoutGroup id="sidebar-rail">
          <SidebarNav sections={sections} homeHref={homeHref} />
        </LayoutGroup>
        <SidebarFooter brand={brand} siteMapHref={siteMapHref} />
      </aside>

      {/* Phones: overlay + slide-out drawer */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ease-out lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        // Keeps the closed drawer's links out of the tab order. Spread so
        // React 18 types (no `inert` prop) accept it.
        {...((!open ? { inert: "" } : {}) as Record<string, string>)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] max-w-[85vw] flex-col border-r border-border bg-bg-subtle transition-transform duration-200 ease-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
          <div className="min-w-0 flex-1">
            <Brand brand={brand} />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        {top}
        <LayoutGroup id="sidebar-drawer">
          <SidebarNav sections={sections} homeHref={homeHref} />
        </LayoutGroup>
        <SidebarFooter brand={brand} siteMapHref={siteMapHref} />
      </aside>
    </>
  );
}

function Brand({ brand }: { brand: ShellBrand }) {
  const Icon = brand.icon;
  return (
    <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fg text-bg">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-fg">{brand.name}</p>
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">{brand.console}</p>
      </div>
    </div>
  );
}

function SidebarFooter({ brand, siteMapHref }: { brand: ShellBrand; siteMapHref?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-[11px] text-fg-muted">
      <span className="truncate">{brand.console} workspace</span>
      {siteMapHref ? (
        <Link href={siteMapHref} className="shrink-0 underline-offset-2 hover:text-fg hover:underline">
          Site map
        </Link>
      ) : null}
    </div>
  );
}

function SidebarNav({ sections, homeHref }: { sections: ReadonlyArray<ShellNavSection>; homeHref: string }) {
  const pathname = usePathname() ?? "/";
  const active = activeNavHref(pathname, sections, homeHref);

  return (
    <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-2 py-3 scrollbar-thin">
      {sections.map((section, i) => {
        if (!section.label) {
          return <NavList key={`top-${i}`} items={section.items} active={active} />;
        }
        const holdsActive = section.items.some((item) => item.href === active);
        return (
          // Keyed on `holdsActive` so the group re-opens when you navigate into it.
          <details
            key={`${section.label}-${holdsActive}`}
            open={holdsActive || section.defaultOpen}
            className="group/nav"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-fg-subtle marker:hidden hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden">
              {section.label}
              <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open/nav:rotate-180" strokeWidth={1.75} />
            </summary>
            <NavList items={section.items} active={active} />
          </details>
        );
      })}
    </nav>
  );
}

function NavList({ items, active }: { items: ShellNavItem[]; active: string | null }) {
  const { setOpen } = useNav();
  return (
    <ul className="space-y-px">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === active;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium transition-colors duration-fast ease-ease",
                isActive ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              {isActive ? (
                <>
                  <motion.span
                    layoutId="sidebar-active"
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-[--accent]/10 ring-1 ring-inset ring-[--accent]/20"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                  <motion.span
                    layoutId="sidebar-active-bar"
                    aria-hidden
                    className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-full bg-[--accent]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                </>
              ) : null}
              <Icon
                className={cn(
                  "relative h-4 w-4 shrink-0",
                  isActive ? "text-[--accent]" : "text-fg-muted group-hover:text-fg"
                )}
                strokeWidth={1.75}
              />
              <span className="relative truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
