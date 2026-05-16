import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode
} from "react";
import { cn } from "./lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-fg placeholder:text-fg-muted",
        "transition-colors duration-fast ease-ease",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...rest}
    />
  );
});

export function Label({
  htmlFor,
  children,
  className
}: {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-sm font-medium leading-none text-fg", className)}
    >
      {children}
    </label>
  );
}

/**
 * Form field with an auto-bound `id` so the visible label is exposed
 * via accessible-name. Caller can still pass an explicit `htmlFor` to
 * override (multi-input fields), in which case nothing is auto-bound.
 * Single-child convention keeps the cloneElement safe.
 */
export function Field({
  label,
  htmlFor,
  hint,
  children
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;

  let body: ReactNode = children;
  if (!htmlFor && isValidElement(children)) {
    const only = Children.only(children) as ReactElement<{
      id?: string;
      "aria-label"?: string;
    }>;
    if (!only.props.id) {
      body = cloneElement(only, { id });
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {body}
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}
