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
import { FieldHint } from "./field-hint";
import { Select } from "./select";

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

  // Bind the label to the first input-like child (Input, Select, a bare
  // input/select/textarea), or to a lone child of any kind. An error line
  // after the input no longer leaves the field without a name.
  let body: ReactNode = children;
  let labelFor = id;
  if (!htmlFor) {
    let bound = false;
    body = Children.map(children, (child) => {
      if (bound || !isValidElement(child)) return child;
      const el = child as ReactElement<{ id?: string }>;
      const t = el.type;
      const inputLike =
        typeof t === "string" ? /^(input|select|textarea)$/.test(t) : t === Input || t === Select || Children.count(children) === 1;
      if (!inputLike) return child;
      bound = true;
      if (el.props.id) {
        labelFor = el.props.id;
        return el;
      }
      return cloneElement(el, { id });
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={labelFor}>{label}</Label>
      {body}
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}
