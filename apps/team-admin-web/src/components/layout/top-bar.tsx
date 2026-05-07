"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useNav } from "./nav-context";

export function TopBar({
  email,
  displayName,
  roleLine,
  isCaptain
}: {
  email: string;
  displayName: string | null;
  roleLine: string;
  isCaptain?: boolean;
}) {
  const router = useRouter();
  const { setOpen } = useNav();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/sign-in?error=signed_out");
    router.refresh();
  }

  const initials = (displayName ?? email).slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/60 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
          <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{roleLine}</span>
        </div>
        {isCaptain ? (
          <span
            title="You hold the captain role for this team"
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-300"
          >
            <Star className="h-3 w-3" strokeWidth={2} />
            Captain
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-[13px] font-medium leading-none text-fg">
            {displayName ?? email}
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-[11px] font-semibold text-bg">
          {initials}
        </div>
        <button
          onClick={signOut}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
