"use client";

import { useMemo, type ReactNode } from "react";
import { AppSidebar, type ShellBrand } from "./app-sidebar";
import { AppTopBar, type ShellUser } from "./app-top-bar";
import { navLinks, type ShellNavSection } from "./nav";
import { NavProvider } from "./nav-context";
import { ShellBreadcrumbs } from "./trail";

/**
 * One chrome for every console: sidebar, top bar with the breadcrumb
 * trail, optional banner, and the page column. Each app passes its own
 * nav, routes, sign-out and slots; the look and behaviour are shared.
 *
 * Pass module-level constants for `sections`, `routes` and `home` so
 * the trail is not recomputed on every render.
 */
export function AppShell({
  brand,
  sections,
  routes,
  home,
  siteMapHref,
  user,
  badge,
  actions,
  leading,
  sidebarTop,
  banner,
  hideSidebar = false,
  onSignOut,
  resolveName,
  children
}: {
  brand: ShellBrand;
  sections: ReadonlyArray<ShellNavSection>;
  /** The app's page patterns ("/teams/[id]"), so crumbs only link to pages. */
  routes: ReadonlyArray<string>;
  home: { href: string; label: string };
  siteMapHref?: string;
  user: ShellUser;
  badge?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  sidebarTop?: ReactNode;
  /** Full-width strip under the top bar, e.g. a registration call. */
  banner?: ReactNode;
  hideSidebar?: boolean;
  onSignOut: () => void | Promise<void>;
  resolveName?: (section: string, id: string) => Promise<string | null>;
  children: ReactNode;
}) {
  const nav = useMemo(() => navLinks(sections), [sections]);

  return (
    <NavProvider>
      <div className="flex min-h-screen bg-bg">
        {hideSidebar ? null : (
          <AppSidebar brand={brand} sections={sections} homeHref={home.href} top={sidebarTop} siteMapHref={siteMapHref} />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopBar
            user={user}
            badge={badge}
            actions={actions}
            leading={leading}
            onSignOut={onSignOut}
            breadcrumbs={<ShellBreadcrumbs nav={nav} home={home} routes={routes} resolveName={resolveName} />}
          />
          {banner}
          {/* pb-24 keeps the last row (form submit bars) clear of fixed
              floating buttons such as the admin command palette. */}
          <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
            <div className="mx-auto max-w-container">{children}</div>
          </main>
        </div>
      </div>
    </NavProvider>
  );
}
