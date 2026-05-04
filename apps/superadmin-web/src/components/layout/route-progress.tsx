"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Top-of-page indeterminate progress bar — the Google-OAuth/nProgress style.
 * Mounts once at the layout level. Tracks pathname + searchParams changes:
 * fades up to ~85% while route transition is in flight, completes to 100%
 * once the new pathname has been stable for one frame.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = pathname + "?" + (searchParams?.toString() ?? "");

  const [pct, setPct] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  // Patch link clicks: as soon as a same-app navigation begins, start the bar.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const link = target.closest?.("a");
      if (!link) return;
      const a = link as HTMLAnchorElement;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      if (!a.href) return;
      try {
        const u = new URL(a.href, window.location.href);
        if (u.origin !== window.location.origin) return;
        if (u.pathname === window.location.pathname && u.search === window.location.search)
          return;
      } catch {
        return;
      }
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  function start() {
    if (trickleRef.current) clearInterval(trickleRef.current);
    if (finishRef.current) clearTimeout(finishRef.current);
    setVisible(true);
    setPct(8);
    trickleRef.current = setInterval(() => {
      setPct((p) => {
        if (p < 30) return p + 6;
        if (p < 60) return p + 3;
        if (p < 80) return p + 1;
        return p;
      });
    }, 180);
  }

  function done() {
    if (trickleRef.current) clearInterval(trickleRef.current);
    setPct(100);
    finishRef.current = setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 280);
  }

  // When the route key changes, complete the bar. First mount: don't show.
  useEffect(() => {
    if (lastKeyRef.current === null) {
      lastKeyRef.current = key;
      return;
    }
    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      done();
    }
  }, [key]);

  useEffect(() => {
    return () => {
      if (trickleRef.current) clearInterval(trickleRef.current);
      if (finishRef.current) clearTimeout(finishRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full origin-left bg-accent"
        style={{
          width: `${pct}%`,
          transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "0 0 8px var(--accent), 0 0 4px var(--accent)"
        }}
      />
    </div>
  );
}
