import { cn } from "./lib/cn";
import type { HTMLAttributes, TableHTMLAttributes } from "react";

export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-surface-1">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...rest}
      />
    </div>
  );
}
export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-surface-2 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted",
        className
      )}
      {...rest}
    />
  );
}
export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...rest} />;
}
export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors duration-fast ease-ease hover:bg-surface-2/60", className)}
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
      className={cn("px-4 py-3 text-left font-medium", className)}
      {...rest}
    />
  );
}
export function TD({
  className,
  ...rest
}: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...rest} />;
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
        className="px-4 py-12 text-center text-sm text-fg-muted"
      >
        {message}
      </td>
    </tr>
  );
}
