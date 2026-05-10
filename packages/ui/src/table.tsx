import { cn } from "./lib/cn";
import type { HTMLAttributes, TableHTMLAttributes } from "react";

/**
 * Editorial table primitive used across every list page.
 *
 *   - Outer surface: rounded-xl + soft border (matches editorial cards)
 *   - Header: mono with 0.18em tracking, surface-2 fill
 *   - Rows: subtle bg-bg-subtle/60 on hover, no zebra striping (would
 *     fight the editorial register)
 *   - Cell padding bumped to px-5 py-3.5 so rows breathe
 */
export function Table({
  className,
  ...rest
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-surface-1">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...rest}
      />
    </div>
  );
}
export function THead({
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-bg-subtle font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted",
        className
      )}
      {...rest}
    />
  );
}
export function TBody({
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("divide-y divide-border", className)} {...rest} />
  );
}
export function TR({
  className,
  ...rest
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors duration-fast ease-ease hover:bg-bg-subtle/70",
        className
      )}
      {...rest}
    />
  );
}
export function TH({
  className,
  ...rest
}: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-5 py-3 text-left font-medium", className)}
      {...rest}
    />
  );
}
export function TD({
  className,
  ...rest
}: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-5 py-3.5 align-middle", className)} {...rest} />;
}

export function EmptyRow({
  colSpan,
  message
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-5 py-14 text-center text-[13px] text-fg-muted"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-subtle">
          // empty
        </span>
        <span className="mt-2 block">{message}</span>
      </td>
    </tr>
  );
}
