"use client";

import { useEffect, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface CommandItem {
  label: string;
  href: string;
  hint?: string;
  group: string;
}

// A static set for v1. Will swap for real search later.
const ITEMS: CommandItem[] = [
  { group: "Go to", label: "Dashboard", href: "/dashboard" },
  { group: "Go to", label: "Organizations", href: "/organizations" },
  { group: "Go to", label: "Users", href: "/users" },
  { group: "Go to", label: "Persons", href: "/persons" },
  { group: "Go to", label: "Roles", href: "/roles" },
  { group: "Go to", label: "Audit", href: "/audit" },
  { group: "League", label: "Seasons", href: "/seasons" },
  { group: "League", label: "Leagues", href: "/leagues" },
  { group: "League", label: "Divisions", href: "/divisions" },
  { group: "League", label: "Teams", href: "/teams" },
  { group: "Roster", label: "Memberships", href: "/rosters" },
  { group: "Compliance", label: "Registrations", href: "/registrations" },
  { group: "Compliance", label: "Forms", href: "/forms" },
  { group: "Compliance", label: "Documents", href: "/documents" },
  { group: "Compliance", label: "Eligibility", href: "/eligibility" },
  { group: "Operations", label: "Games", href: "/games" },
  { group: "Operations", label: "Live games", href: "/games?status=in_play" },
  { group: "Operations", label: "Final scores", href: "/games?status=completed" },
  { group: "Operations", label: "Game events", href: "/game-events" },
  { group: "Analytics", label: "Player lines", href: "/stats?tab=lines" },
  { group: "Analytics", label: "Standings", href: "/stats?tab=standings" },
  { group: "Analytics", label: "Leaderboards", href: "/stats?tab=leaderboards" },
  { group: "Communications", label: "Outbox", href: "/communications" },
  { group: "Communications", label: "Templates", href: "/communications/templates" },
  { group: "Communications", label: "Queued", href: "/communications?status=queued" },
  { group: "Communications", label: "Failed", href: "/communications?status=failed" },
  { group: "Platform", label: "Audit log", href: "/audit" },
  { group: "Platform", label: "Reports", href: "/reports" },
  { group: "Finance", label: "Invoices", href: "/finance" },
  { group: "Finance", label: "Outstanding", href: "/finance?status=sent" },
  { group: "Finance", label: "Overdue", href: "/finance?status=overdue" },
  { group: "Admin", label: "Health", href: "/admin?tab=health" },
  { group: "Admin", label: "Settings", href: "/admin?tab=settings" },
  { group: "Admin", label: "Feature flags", href: "/admin?tab=flags" },
  { group: "Admin", label: "Sports", href: "/admin?tab=sports" },
  { group: "Admin", label: "Data Migration", href: "/data-migration" }
];

export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  // ⌘K / ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((s) => !s);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Floating bottom-right trigger pill */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className={cn(
          "fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 rounded-full",
          "border border-border bg-surface-1 px-3.5 py-2.5 shadow-md",
          "transition-all duration-fast ease-ease hover:border-border-strong hover:shadow-md",
          "focus-visible:outline-none focus-visible:shadow-focus"
        )}
      >
        <Sparkles
          className="h-3.5 w-3.5 text-[var(--tint-violet-fg)]"
          strokeWidth={1.75}
        />
        <span className="text-[13px] font-medium text-fg">
          Ask the assistant
        </span>
        <span className="ml-1 inline-flex h-5 items-center rounded-md border border-border bg-surface-2 px-1.5 font-mono text-[10px] text-fg-muted">
          ⌘K
        </span>
      </button>

      {open ? <Palette q={q} setQ={setQ} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Palette({
  q,
  setQ,
  onClose
}: {
  q: string;
  setQ: (s: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const filtered = q.trim()
    ? ITEMS.filter((i) =>
        i.label.toLowerCase().includes(q.toLowerCase()) ||
        i.group.toLowerCase().includes(q.toLowerCase())
      )
    : ITEMS;

  // Group output for display
  const groups: Record<string, CommandItem[]> = {};
  for (const i of filtered) {
    if (!groups[i.group]) groups[i.group] = [];
    groups[i.group]!.push(i);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
    >
      <button
        aria-label="Close command palette"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface-1 shadow-md">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, orgs, leagues, persons…"
            className="h-12 w-full bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
          {Object.keys(groups).length === 0 ? (
            <p className="p-8 text-center text-sm text-fg-muted">No matches</p>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                  {group}
                </p>
                {items.map((i) => (
                  <button
                    key={i.href}
                    onClick={() => {
                      onClose();
                      router.push(i.href);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-fg transition-colors duration-fast ease-ease hover:bg-surface-2"
                  >
                    <span>{i.label}</span>
                    <span className="font-mono text-[10px] text-fg-muted">
                      {i.href}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-fg-muted">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-surface-2 px-1 py-px font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-surface-2 px-1 py-px font-mono">ESC</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
