import type { ReactNode } from "react";

import { Alert } from "@sportspulse/ui";
/**
 * Right-pane section header — title + subtitle on the left, optional
 * action button on the right. Mirrors the chrome at the top of every
 * mockup section panel.
 */
export function SectionHeader({
  title,
  subtitle,
  warning,
  action
}: {
  title: string;
  subtitle?: string;
  /** Amber inline note rendered below the subtitle (e.g. divisions issue). */
  warning?: string | null;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
      <div>
        <p className="text-[18px] font-semibold tracking-tight text-fg">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-1 text-[12px] text-fg-muted">{subtitle}</p>
        ) : null}
        {warning ? (
          <Alert tone="warning" className="mt-1">{warning}</Alert>
        ) : null}
      </div>
      {action}
    </header>
  );
}
