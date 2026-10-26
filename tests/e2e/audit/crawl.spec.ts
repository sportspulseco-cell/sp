import { test, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, signedInAs, type Role } from "../journeys/_helpers";

/**
 * Full-surface audit crawl (PPHL, 24 Oct 2026: "404 errors all over the
 * place"). Signs in as each role on its app, starts from the home page
 * and every sidebar link, follows every same-origin link it finds (depth
 * 3, capped), and records for every page: HTTP status, final URL, title,
 * h1, whether the page is a 404 / error boundary / "could not load"
 * alert / placeholder, every failed API call during load, console
 * errors, and load time. Output: test-results-audit/crawl-<role>.json.
 * Read-only: it never clicks buttons, only follows links.
 */
// Read-only (it only follows links), so it may also run on production
// with the smoke accounts when AUDIT_TARGET=prod is set explicitly.
const TARGET = process.env.AUDIT_TARGET ?? (IS_STAGING ? "staging" : "");
test.skip(!TARGET, "set E2E_TARGET=staging, or AUDIT_TARGET=prod for a read-only production crawl");

// AUDIT_OUT names the folder (e.g. staging-v2 for a post-deploy re-run) so
// runs can be compared instead of overwriting each other.
const OUT_DIR = `test-results-audit/${process.env.AUDIT_OUT ?? TARGET}`;
const MAX_PAGES = Number(process.env.AUDIT_MAX_PAGES ?? 220);
const MAX_DEPTH = 3;
// Same list-of-ids pages differ only by id; visit at most this many per pattern.
const MAX_PER_PATTERN = 3;

const ROLES: Array<{ role: Role; app: string }> = [
  { role: "superAdmin", app: E2E_URLS.superadmin },
  // PPHL's own persona: a league admin signs in to the admin console and
  // sees a league-scoped view; its 404s are the ones PPHL reported.
  { role: "leagueAdmin", app: E2E_URLS.superadmin },
  { role: "orgAdmin", app: E2E_URLS.orgAdmin },
  { role: "teamAdmin", app: E2E_URLS.teamAdmin },
  { role: "player", app: E2E_URLS.player }
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SKIP = /\/(sign-out|logout|auth\/callback)(\/|$)|^mailto:|^tel:|\.(pdf|csv|png|jpg)$/i;
const NOT_FOUND = /(This page could not be found|This page is not here|404|Page not found|not be found)/i;
const ERROR_BOUNDARY = /(Something went wrong|Application error|Unhandled Runtime Error|Could not complete|server problem on our side)/i;
const COULD_NOT_LOAD = /(Could not load|Couldn't load|Failed to load|Sign in expired)/i;
const PLACEHOLDER = /(coming soon|not built yet|not yet available|under construction|placeholder|will appear here once|is on the roadmap)/i;

interface Visit {
  role: string;
  url: string;
  pattern: string;
  from: string | null;
  depth: number;
  status: number | null;
  finalUrl: string;
  title: string;
  h1: string;
  ms: number;
  notFound: boolean;
  errorBoundary: boolean;
  couldNotLoad: boolean;
  placeholder: boolean;
  emptyState: string | null;
  apiFailures: string[];
  consoleErrors: string[];
  linkCount: number;
  textSample: string;
}

function patternOf(url: URL): string {
  return url.pathname.replace(UUID, ":id").replace(/\/\d+(\/|$)/g, "/:n$1");
}

async function crawl(role: Role, app: string, context: BrowserContext, page: Page): Promise<Visit[]> {
  const origin = new URL(app).origin;
  const visits: Visit[] = [];
  const seen = new Set<string>();
  const perPattern = new Map<string, number>();
  const queue: Array<{ url: string; from: string | null; depth: number }> = [{ url: `${origin}/`, from: null, depth: 0 }];

  let apiFailures: string[] = [];
  let consoleErrors: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && /sportspulse\.us\/api\/|staging-api|supabase\.co\/(rest|functions)/.test(u)) {
      apiFailures.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
    }
  });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));

  while (queue.length && visits.length < MAX_PAGES) {
    const item = queue.shift()!;
    let u: URL;
    try {
      u = new URL(item.url);
    } catch {
      continue;
    }
    u.hash = "";
    const key = u.pathname + u.search;
    if (seen.has(key)) continue;
    seen.add(key);
    const pattern = patternOf(u);
    const n = perPattern.get(pattern) ?? 0;
    if (n >= MAX_PER_PATTERN) continue;
    perPattern.set(pattern, n + 1);

    apiFailures = [];
    consoleErrors = [];
    const t0 = Date.now();
    let status: number | null = null;
    try {
      const resp = await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
      status = resp?.status() ?? null;
      // Let client fetches settle without waiting forever on pollers.
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(400);
    } catch (e) {
      visits.push({
        role, url: key, pattern, from: item.from, depth: item.depth, status: null, finalUrl: page.url(),
        title: "", h1: "", ms: Date.now() - t0, notFound: false, errorBoundary: true, couldNotLoad: false,
        placeholder: false, emptyState: null, apiFailures: [...apiFailures],
        consoleErrors: [`navigation: ${(e as Error).message.slice(0, 160)}`], linkCount: 0, textSample: ""
      });
      continue;
    }
    const ms = Date.now() - t0;
    const finalUrl = page.url();
    const title = await page.title().catch(() => "");
    const h1 = (await page.locator("h1").first().innerText({ timeout: 1500 }).catch(() => "")).trim();
    const main = page.locator("main").first();
    const text = ((await main.innerText({ timeout: 3000 }).catch(() => "")) || (await page.locator("body").innerText().catch(() => ""))).replace(/\s+/g, " ");
    const headings = await page.locator("main h2, main h3").allInnerTexts().catch(() => [] as string[]);
    const emptyState = headings.find((h) => /^No .+ (yet|found|match)|Nothing (here|to show)|is empty$/i.test(h.trim())) ?? null;

    // Links on this page (same origin), queued for the next depth.
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href)).catch(() => [] as string[]);
    const sameOrigin = [...new Set(hrefs)].filter((h) => h.startsWith(origin) && !SKIP.test(h));
    if (item.depth < MAX_DEPTH) for (const h of sameOrigin) queue.push({ url: h, from: key, depth: item.depth + 1 });

    visits.push({
      role, url: key, pattern, from: item.from, depth: item.depth, status, finalUrl, title, h1, ms,
      notFound: (status === 404) || NOT_FOUND.test(h1) || /This page could not be found|This page is not here|404 · not found/i.test(text),
      errorBoundary: ERROR_BOUNDARY.test(text) || (status !== null && status >= 500),
      couldNotLoad: COULD_NOT_LOAD.test(text),
      placeholder: PLACEHOLDER.test(text),
      emptyState,
      apiFailures: [...new Set(apiFailures)],
      consoleErrors: [...new Set(consoleErrors)].slice(0, 5),
      linkCount: sameOrigin.length,
      textSample: text.slice(0, 240)
    });
  }
  return visits;
}

for (const { role, app } of ROLES) {
  test(`crawl as ${role}`, async ({ browser }) => {
    test.setTimeout(40 * 60_000);
    const { page, context } = await signedInAs(browser, role, { app });
    const visits = await crawl(role, app, context, page);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}/crawl-${role}.json`, JSON.stringify(visits, null, 1));
    const bad = visits.filter((v) => v.notFound || v.errorBoundary || v.couldNotLoad || v.apiFailures.length);
    console.log(`[audit] ${role}: visited ${visits.length}, patterns ${new Set(visits.map((v) => v.pattern)).size}, problems ${bad.length}`);
    for (const v of bad) {
      console.log(`[audit]   ${v.url} status=${v.status} nf=${v.notFound} err=${v.errorBoundary} load=${v.couldNotLoad} api=${v.apiFailures.slice(0, 3).join(" | ")}`);
    }
    await context.close();
  });
}
