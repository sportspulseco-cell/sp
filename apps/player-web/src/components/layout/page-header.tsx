import type { ReactNode } from "react";
import { Eyebrow } from "@sportspulse/ui";

export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
      <div className="space-y-3 min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="text-[36px] font-semibold leading-[1.05] tracking-tighter text-fg">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[14px] leading-relaxed text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
