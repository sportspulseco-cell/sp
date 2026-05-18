import type { ReactNode } from "react";

/**
 * dt/dd pair used across every detail-page metadata grid.
 *
 * The `tag` prop used to render a chip with the underlying DB column
 * name on the right — useful when iterating on the schema, distracting
 * for end users. Kept as an accepted prop so existing call sites
 * compile, but no longer rendered.
 */
export function Field({
  label,
  mono,
  children
}: {
  label: string;
  /** Legacy DB-column annotation; ignored at render time. */
  tag?: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-fg-muted">{label}</dt>
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
