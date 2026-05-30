"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@sportspulse/ui";

interface Tab {
  href: string;
  label: string;
}

/**
 * Sub-nav tabs across the scheduling section for one season.
 * Highlights the active tab via usePathname.
 *
 * The basePath lets each app rebase the routes (superadmin-web =
 * `/scheduling`, org-admin-web = `/scheduling`, same here but pinned
 * by the caller in case a future surface needs a different prefix).
 */
export function SchedulingTabs({
  seasonId,
  basePath = "/scheduling"
}: {
  seasonId: string;
  basePath?: string;
}) {
  const pathname = usePathname() ?? "";
  const base = `${basePath}/${seasonId}`;
  const tabs: Tab[] = [
    { href: `${base}/generate`, label: "Generate" },
    { href: `${base}/fairness`, label: "Fairness" },
    { href: `${base}/conflicts`, label: "Conflicts" },
    { href: `${base}/verify`, label: "Verify" },
    { href: `${base}/parity`, label: "Parity" },
    { href: `${base}/runs`, label: "Runs" },
    { href: `${base}/rinks`, label: "Rinks" }
  ];
  return (
    <nav className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative inline-flex h-9 items-center px-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
              active ? "text-fg" : "text-fg-muted hover:text-fg"
            )}
          >
            {t.label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-px bg-fg" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
