"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface RailItem {
  label: string;
  href?: string;
  /** Click handler — used when not a link */
  onClick?: () => void;
  icon?: LucideIcon;
  active?: boolean;
}

// Vertical mono-labeled step nav (SuperAccountant lesson page pattern):
// WATCH / READ / VISUALIZE / FLOW / MAP / PRACTICE
export function SectionRail({
  items,
  className
}: {
  items: RailItem[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border border-border bg-surface-1 p-2",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.active ??
          (item.href
            ? pathname === item.href || pathname.startsWith(`${item.href}/`)
            : false);
        const inner = (
          <>
            <span
              aria-hidden
              className={cn(
                "h-3 w-px shrink-0 rounded-full transition-colors duration-fast",
                isActive ? "bg-accent" : "bg-transparent"
              )}
            />
            {Icon ? (
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-colors duration-fast",
                  isActive ? "text-accent" : "text-fg-muted"
                )}
                strokeWidth={1.75}
              />
            ) : null}
            <span
              className={cn(
                "font-mono text-[11px] font-medium uppercase tracking-wide transition-colors duration-fast",
                isActive ? "text-fg" : "text-fg-muted"
              )}
            >
              {item.label}
            </span>
          </>
        );
        const cls = cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors duration-fast ease-ease",
          isActive ? "bg-surface-2" : "hover:bg-surface-2"
        );
        return item.href ? (
          <Link key={item.label} href={item.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={cn(cls, "text-left")}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
