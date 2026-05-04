import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";

export function PageHeader({
  title,
  description,
  eyebrow,
  eyebrowDot,
  action
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  eyebrowDot?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="mb-10 flex items-end justify-between gap-4 border-b border-border pb-8">
      <div className="space-y-3">
        {eyebrow ? <Eyebrow dot={eyebrowDot}>{eyebrow}</Eyebrow> : null}
        <h1 className="text-[44px] font-semibold leading-[1.05] tracking-tighter text-fg">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[15px] leading-relaxed text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
