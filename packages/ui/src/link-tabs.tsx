/**
 * A row of filter tabs kept in the URL (`?<param>=<value>`), so the
 * server page reads the same param and a filtered list survives reload.
 * Server-rendered links, no client state. The schedule's Upcoming /
 * Completed / All tabs in player-web and team-admin-web use it (F-5).
 */
export function LinkTabs({
  tabs,
  selected,
  param = "filter",
  basePath = "",
  label
}: {
  tabs: Array<{ value: string; label: string }>;
  selected: string;
  param?: string;
  /** Path the links point at; "" keeps the current page. */
  basePath?: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="inline-flex rounded-md border border-border bg-bg-subtle p-0.5">
      {tabs.map((t) => {
        const active = t.value === selected;
        return (
          <a
            key={t.value}
            href={`${basePath}?${param}=${encodeURIComponent(t.value)}`}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex h-8 items-center rounded px-3 font-mono text-[10px] uppercase tracking-widest " +
              (active ? "bg-fg text-bg" : "text-fg-muted hover:text-fg")
            }
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
