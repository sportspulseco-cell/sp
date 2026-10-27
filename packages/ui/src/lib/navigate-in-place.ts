let latest = 0;

/**
 * Move to `url` on the same page without a reload, and make sure it
 * happens. `go` is the router call (router.replace or router.push). The
 * app router sometimes drops a navigation without an error: on the first
 * page after sign-in a filter pick never reached the URL (list-filters,
 * 1 of 4 fresh sign-ins on staging, 27 Oct). If the address has not
 * moved after `timeoutMs`, this loads the page instead. Only the most
 * recent call can fall back, so quick successive picks never land on an
 * older one.
 */
export function navigateInPlace(go: (href: string) => void, url: string, timeoutMs = 4000): void {
  const from = window.location.pathname + window.location.search;
  const want = new URL(url, window.location.href);
  const target = want.pathname + want.search;
  const call = ++latest;
  go(url);
  if (target === from) return;
  setTimeout(() => {
    if (call !== latest) return;
    const now = window.location.pathname + window.location.search;
    if (now !== from) return;
    console.warn(`[navigateInPlace] router dropped ${target}; loading the page instead`);
    window.location.assign(target);
  }, timeoutMs);
}
