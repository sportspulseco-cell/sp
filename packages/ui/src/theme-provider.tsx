"use client";

/**
 * Shared next-themes wrapper. Each consuming app passes its own
 * storageKey so a user's preference doesn't leak across the org-admin /
 * team-admin / player surfaces (they sign in as different roles, on
 * different subdomains, and don't share localStorage anyway — but the
 * separate keys keep the contract explicit).
 *
 * Default theme is dark to match the landing-web reference DNA. apps
 * can override by passing `defaultTheme`. `enableSystem` stays off so
 * the locked editorial palette doesn't flip mid-session if the OS
 * switches modes.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export interface ThemeProviderProps {
  /** Required — unique per app so preferences don't collide. */
  storageKey: string;
  /** Default theme on first paint. Hallmark default = "dark". */
  defaultTheme?: "dark" | "light";
  children: ReactNode;
}

export function ThemeProvider({
  storageKey,
  defaultTheme = "dark",
  children
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem={false}
      storageKey={storageKey}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
