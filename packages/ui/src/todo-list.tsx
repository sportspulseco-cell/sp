import Link from "next/link";
import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";
import { cn } from "./lib/cn";

export interface TodoItem {
  /** Plain sentence, e.g. "2 registrations to review". */
  label: string;
  /** Button text, a verb: "Review", "Follow up", "Sign". */
  action: string;
  href: string;
  icon?: LucideIcon;
  /** "warn" for money or deadlines at risk. */
  tone?: "default" | "warn";
}

/**
 * "Needs you": the unfinished tasks for the signed-in person, each with
 * one button (doc/design/guided-ui.md: Zeigarnik, one action per item).
 * Pass only items that have something waiting; with none it says so in
 * one line instead of showing zeros.
 */
export function TodoList({
  items,
  title = "Needs you",
  doneText = "Nothing is waiting on you.",
  className
}: {
  items: TodoItem[];
  title?: string;
  doneText?: string;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("space-y-3", className)}>
      <h2 className="text-[17px] font-semibold tracking-tight text-fg">{title}</h2>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-[14px] text-fg-muted">
          <CheckCircle2 className="h-4 w-4 text-[var(--tint-emerald-fg)]" strokeWidth={1.75} aria-hidden />
          {doneText}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
          {items.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.href + t.label}>
                <Link
                  href={t.href}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-focus"
                >
                  {Icon ? (
                    <Icon
                      className={cn("h-4 w-4 shrink-0", t.tone === "warn" ? "text-[var(--tint-rose-fg)]" : "text-fg-muted")}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 text-[14px] font-medium text-fg">{t.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[--accent]">
                    {t.action}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
