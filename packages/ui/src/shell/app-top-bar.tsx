"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, Menu, Star } from "lucide-react";
import { cn } from "../lib/cn";
import { ThemeToggle } from "../theme-toggle";
import { useNav } from "./nav-context";

export interface ShellUser {
  email: string;
  displayName: string | null;
  /** Who you are signed in as here, e.g. "captain · 1 team". */
  roleLine: string;
}

/**
 * The console top bar. Left: menu button (phones) and the breadcrumb
 * trail. Right: app actions (e.g. the organisation switcher), the
 * theme toggle, and the account menu, which holds sign-out.
 */
export function AppTopBar({
  user,
  breadcrumbs,
  badge,
  actions,
  leading,
  onSignOut
}: {
  user: ShellUser;
  breadcrumbs?: ReactNode;
  /** A short role pill next to the account, e.g. "Captain". */
  badge?: ReactNode;
  actions?: ReactNode;
  /**
   * Replaces the menu button, for consoles without a sidebar (e.g. the
   * game-day official view's "My games" link).
   */
  leading?: ReactNode;
  onSignOut: () => void | Promise<void>;
}) {
  const { setOpen } = useNav();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/60 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leading ?? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted transition-colors duration-fast ease-ease hover:bg-surface-2 hover:text-fg lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
        <div className="flex min-w-0 flex-1">{breadcrumbs}</div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {actions}
        {badge ? <div className="hidden md:block">{badge}</div> : null}
        <ThemeToggle />
        <AccountMenu user={user} badge={badge} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

function AccountMenu({
  user,
  badge,
  onSignOut
}: {
  user: ShellUser;
  badge?: ReactNode;
  onSignOut: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = user.displayName ?? user.email;
  const initials = name.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-1 transition-colors hover:bg-surface-2 sm:pl-2"
      >
        <span className="hidden min-w-0 text-right sm:block">
          <span className="block max-w-[18ch] truncate text-[13px] font-medium leading-none text-fg">{name}</span>
          <span className="mt-1 block max-w-[28ch] truncate font-mono text-[9px] uppercase tracking-[0.18em] text-fg-muted">
            {user.roleLine}
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-[11px] font-semibold text-bg">
          {initials}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-[13px] font-medium text-fg">{name}</p>
            {user.displayName ? <p className="truncate text-[12px] text-fg-muted">{user.email}</p> : null}
            <p className="mt-1.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">{user.roleLine}</p>
            {badge ? <div className="mt-2 md:hidden">{badge}</div> : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className={cn(
              "flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-fg transition-colors hover:bg-surface-2",
              signingOut && "opacity-60"
            )}
          >
            <LogOut className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A role pill for the top bar's `badge` slot, e.g. "Captain" in the
 * team and player consoles. Same look in every console.
 */
export function RolePill({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-amber-fg)]"
    >
      <Star className="h-3 w-3" strokeWidth={2} />
      {label}
    </span>
  );
}
