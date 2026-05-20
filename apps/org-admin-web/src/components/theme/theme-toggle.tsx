"use client";

/**
 * Sun ↔ moon toggle. Sits in the TopBar so it's always reachable.
 * Mounted client-side; first render shows a neutral placeholder so
 * Tailwind hydration doesn't flash the wrong icon.
 *
 * 8-state contract per Hallmark component spec:
 *   default · hover · focus-visible · active · disabled · loading
 *   (loading rolls into the unmounted state — same placeholder)
 *   error / success: n/a for a stateless toggle.
 */
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="
        inline-flex h-8 w-8 items-center justify-center rounded-md
        border border-border bg-surface-1 text-fg-muted
        transition-[background-color,border-color,color] duration-fast ease-ease
        hover:border-border-strong hover:text-fg
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg
        active:scale-[0.97]
        disabled:cursor-not-allowed disabled:opacity-50
      "
    >
      {!mounted ? (
        <span className="h-3.5 w-3.5" aria-hidden />
      ) : isDark ? (
        <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
      ) : (
        <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
    </button>
  );
}
