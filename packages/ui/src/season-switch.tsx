/**
 * One roster, one season (CAP-19). Shows the seasons a team has played
 * as links that set `?season=<id>`; the page renders only that season.
 * Server-rendered links, no client state. Hidden when there is only one.
 */
export function SeasonSwitch({
  seasons,
  selectedId,
  param = "season",
  basePath = ""
}: {
  seasons: Array<{ id: string; name: string; current?: boolean }>;
  selectedId: string | null;
  param?: string;
  /** Path the links point at; "" keeps the current page. */
  basePath?: string;
}) {
  if (seasons.length < 2) return null;
  return (
    <nav aria-label="Season" className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-fg-muted">Season</span>
      {seasons.map((s) => {
        const active = s.id === selectedId;
        return (
          <a
            key={s.id}
            href={`${basePath}?${param}=${encodeURIComponent(s.id)}`}
            aria-current={active ? "true" : undefined}
            className={
              "inline-flex h-7 items-center rounded-full border px-3 text-[12px] transition-colors " +
              (active
                ? "border-fg bg-surface-2 font-medium text-fg"
                : "border-border text-fg-muted hover:border-fg-muted hover:text-fg")
            }
          >
            {s.name}
            {s.current ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-fg-muted">current</span> : null}
          </a>
        );
      })}
    </nav>
  );
}
