"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { useNav } from "./nav-context";
import { LiveDot } from "@/components/motion/kinetic";

/**
 * Editorial top bar — minimal mono breadcrumb on the left, account
 * cluster on the right. Matches the landing-site DNA: no heavy chrome,
 * the page hero does the visual work.
 */
export function TopBar({
  email,
  displayName
}: {
  email: string;
  displayName: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpen } = useNav();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/sign-in?error=signed_out");
    router.refresh();
  }

  const initials = (displayName ?? email).slice(0, 2).toUpperCase();
  const breadcrumb = pathToBreadcrumb(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/60 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted transition-colors duration-fast ease-ease hover:bg-surface-2 hover:text-fg lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" strokeWidth={1.75} />
        </button>

        {/* Mono breadcrumb — editorial location indicator */}
        <div className="hidden min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted sm:flex">
          <span className="text-fg-subtle">//</span>
          <span className="truncate text-fg">{breadcrumb}</span>
        </div>

        {/* Search — minimal inline, no boxed surface */}
        <button
          type="button"
          className="ml-auto hidden items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg md:inline-flex"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            search
          </span>
          <kbd className="ml-1 rounded border border-border bg-bg-subtle px-1.5 py-px font-mono text-[10px] text-fg-subtle">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Live status pill — subtle reassurance the platform is up */}
        <div className="hidden items-center gap-1.5 rounded-full border border-border bg-bg-subtle px-2.5 py-1 lg:inline-flex">
          <LiveDot tone="success" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            online
          </span>
        </div>

        <div className="hidden text-right sm:block">
          <p className="text-[13px] font-medium leading-none text-fg">
            {displayName ?? email}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-fg-muted">
            super · admin
          </p>
        </div>

        <button
          type="button"
          className="group relative flex h-8 w-8 items-center justify-center rounded-full bg-fg text-[11px] font-semibold text-bg transition-transform hover:scale-105"
          aria-label="Account"
        >
          {initials}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[--accent]/0 transition-all duration-200 group-hover:ring-[--accent]/50"
          />
        </button>

        <button
          onClick={signOut}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted transition-colors duration-fast ease-ease hover:bg-surface-2 hover:text-fg"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}

/**
 * Render the current path as a breadcrumb string with `·` separators.
 * "/forms/abc-123/setup" → "forms · abc-123 · setup".
 * Truncates UUID-shaped segments to first 8 chars so they don't blow
 * out the bar.
 */
function pathToBreadcrumb(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "platform";
  return parts
    .map((p) => {
      // Compact UUIDs and other long ids
      if (/^[0-9a-f-]{16,}$/i.test(p)) return p.slice(0, 8);
      return p.replace(/-/g, " ");
    })
    .join(" · ");
}
