import type { ReactNode } from "react";

/**
 * dt/dd pair used across every detail-page metadata grid.
 * Optional `tag` chip renders the DB column name on the right.
 */
export function Field({
  label,
  tag,
  mono,
  children
}: {
  label: string;
  tag?: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </dt>
        {tag ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
            {tag}
          </span>
        ) : null}
      </div>
      <dd
        className={
          mono ? "mt-1 font-mono text-[12px] text-fg" : "mt-1 text-[13px] text-fg"
        }
      >
        {children}
      </dd>
    </div>
  );
}
