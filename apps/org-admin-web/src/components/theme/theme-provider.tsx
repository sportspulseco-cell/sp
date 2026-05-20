"use client";

/**
 * next-themes wrapper. Dark default per design.md; class attribute
 * matches Tailwind's `darkMode: "class"` config. enableSystem off so
 * the chosen theme persists across devices and matches the design
 * system's editorial palette without flipping mid-session.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="sp-org-admin-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
