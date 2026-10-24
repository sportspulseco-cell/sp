import type { ReactNode } from "react";
import { Alert } from "./alert";

/**
 * What a page shows when its data could not be loaded. The message
 * names who is responsible: the caller's role (401/403) or our server
 * (anything else). A real 404 never reaches this component; the page
 * calls `notFound()` for that.
 */
export function LoadError({
  what,
  status,
  message,
  action,
  className
}: {
  /** Plural or singular noun, e.g. "this team" or "users". */
  what: string;
  status: number | null;
  /** Server message, shown small for support. */
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  const forbidden = status === 401 || status === 403;
  return (
    <Alert tone={forbidden ? "warning" : "error"} className={className}>
      <p className="font-medium">
        {forbidden
          ? `Your role does not have access to ${what}.`
          : `Could not load ${what}.`}
      </p>
      <p className="mt-0.5 opacity-80">
        {forbidden
          ? "Ask a super admin to grant it. Nothing is wrong with the data."
          : "This is a server problem on our side, not your data. Reload to try again."}
      </p>
      {message && !forbidden ? (
        <p className="mt-1 font-mono text-[10px] opacity-60">{message}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Alert>
  );
}
