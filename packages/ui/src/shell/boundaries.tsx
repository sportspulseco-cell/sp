import Link from "next/link";
import { PageHeaderSkeleton, StatCardSkeleton, TableSkeleton } from "../skeleton";

/**
 * The route boundaries every console shares: loading.tsx renders
 * <RouteLoading>, not-found.tsx renders <NotFoundPanel>, error.tsx
 * renders <ErrorFallback>. One look for "wait", "not here" and "broke".
 */

/** Skeleton of a console page while its data streams in. */
export function RouteLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-8">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <TableSkeleton rows={5} cols={4} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * A page or record that does not exist, or that this role may not see
 * (the API answers 404 for both, so nothing leaks).
 */
export function NotFoundPanel({
  homeHref = "/",
  homeLabel = "Go to home",
  fullScreen = false
}: {
  homeHref?: string;
  homeLabel?: string;
  /** True outside the console shell (unknown URL before sign-in). */
  fullScreen?: boolean;
}) {
  const card = (
    <div role="alert" className="w-full max-w-lg rounded-xl border border-border bg-surface-1 p-7 shadow-sm sm:p-10">
      <p className="font-mono text-[11px] uppercase tracking-widest text-accent">404 · not found</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">This page is not here</h1>
      <p className="mt-3 text-sm leading-6 text-fg-muted">
        The link may be old, or the record was removed, or your role cannot open it. Check the address, or start again
        from home.
      </p>
      <Link
        href={homeHref}
        className="mt-7 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-[var(--accent-hover)]"
      >
        {homeLabel}
      </Link>
    </div>
  );
  return fullScreen ? (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12 text-fg">{card}</main>
  ) : (
    <div className="flex min-h-[60vh] items-center justify-center py-12">{card}</div>
  );
}
