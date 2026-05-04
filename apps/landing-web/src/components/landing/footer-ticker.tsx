const ITEMS = [
  "BELMONT, MA",
  "BOSTON",
  "DUBAI",
  "SINGAPORE",
  "EN-AR-HI MULTILINGUAL",
  "$17.5B MARKET INFRASTRUCTURE",
  "LONDON",
  "LOS ANGELES",
  "GLOBAL SCALE",
  "ZERO DOWNTIME",
  "24 LEAGUES ACTIVE",
  "INFO@SPORTSPULSE.IO"
];

export function FooterTicker() {
  // Duplicate the list so the marquee loops seamlessly without a visible jump.
  const all = [...ITEMS, ...ITEMS];
  return (
    <div className="overflow-hidden border-t border-border bg-bg-subtle py-5">
      <div className="flex w-fit animate-ticker items-center whitespace-nowrap will-change-transform">
        {all.map((it, i) => (
          <span
            key={i}
            className="flex items-center gap-6 px-6 font-mono text-[11px] uppercase tracking-widest text-fg-muted"
          >
            {it}
            <span aria-hidden className="h-1 w-1 rounded-full bg-fg-subtle" />
          </span>
        ))}
      </div>
    </div>
  );
}
