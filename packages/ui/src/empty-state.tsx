import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * What a list shows when it has nothing yet: an icon, one short line,
 * and the button that fixes it (doc/design/guided-ui.md).
 * `eyebrow` is accepted for older callers and ignored.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Ignored. Kept so existing callers compile. */
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-1 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2">
        <Icon className="h-5 w-5 text-fg-muted" strokeWidth={1.5} />
      </div>
      <h3 className="max-w-sm text-[15px] font-semibold tracking-tight text-fg">
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-fg-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
