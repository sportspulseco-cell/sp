import { createRequire } from "node:module";
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import https from "node:https";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH } from "../../../playwright.config";

/**
 * Shared helpers for the PPHL cross-app journeys (doc/testing/pphl-journey-matrix.md).
 *
 * Journeys MUTATE data, so they only run against staging. Every row a
 * journey creates carries RUN_TAG in its name so a run can be found and
 * cleaned up. Each role gets its own browser context, signed in on its
 * own app, because the role apps keep separate Supabase sessions.
 */

export const IS_STAGING = process.env.E2E_TARGET === "staging";

/** Unique, human-readable tag for rows created by this run. */
export const RUN_TAG = process.env.E2E_RUN_TAG ?? `E2E${Date.now().toString(36).toUpperCase()}`;

export type Role = "superAdmin" | "leagueAdmin" | "orgAdmin" | "teamAdmin" | "player";

const APP_FOR_ROLE: Record<Role, string> = {
  superAdmin: E2E_URLS.superadmin,
  leagueAdmin: E2E_URLS.league,
  orgAdmin: E2E_URLS.orgAdmin,
  teamAdmin: E2E_URLS.teamAdmin,
  player: E2E_URLS.player
};

export function appFor(role: Role): string {
  return APP_FOR_ROLE[role];
}

/** Fresh browser context (own cookies) carrying the staging Vercel bypass. */
export async function freshContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext(
    IS_STAGING && existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {}
  );
  logSlowRequests(context);
  return context;
}

const SLOW_MS = 8_000;
const SLOW_LOG = resolve("test-results-audit/slow-requests.jsonl");

/**
 * Evidence for page changes that hang: every request that took longer
 * than 8 s, or was still open when the context closed, goes to
 * test-results-audit/slow-requests.jsonl with its URL and kind (RSC page
 * data, API call, document). Navigations stalled 20-30 s on staging with
 * no error (J17, J7.3, 27 Oct); this says which server was slow.
 */
function logSlowRequests(context: BrowserContext) {
  const started = new Map<object, { url: string; method: string; rsc: boolean; at: number }>();
  const write = (row: Record<string, unknown>) => {
    try {
      mkdirSync(dirname(SLOW_LOG), { recursive: true });
      appendFileSync(SLOW_LOG, JSON.stringify({ when: new Date().toISOString(), ...row }) + "\n");
    } catch {
      /* evidence only */
    }
  };
  context.on("request", (r) => {
    const h = r.headers();
    started.set(r, { url: r.url(), method: r.method(), rsc: h["rsc"] === "1", at: Date.now() });
  });
  const done = (r: object, outcome: string) => {
    const s = started.get(r);
    started.delete(r);
    if (s && Date.now() - s.at > SLOW_MS) write({ ...s, ms: Date.now() - s.at, outcome });
  };
  context.on("requestfinished", (r) => done(r, "finished"));
  context.on("requestfailed", (r) => done(r, `failed: ${r.failure()?.errorText ?? "?"}`));
  context.on("close", () => {
    for (const s of started.values()) if (Date.now() - s.at > SLOW_MS) write({ ...s, ms: Date.now() - s.at, outcome: "still open at close" });
  });
}

/**
 * Open a new context signed in as `role` on that role's app. Pass
 * `email`/`password` to sign in as a user the journey created itself.
 */
export async function signedInAs(
  browser: Browser,
  role: Role,
  opts: { email?: string; password?: string; app?: string } = {}
): Promise<{ context: BrowserContext; page: Page; app: string }> {
  const context = await freshContext(browser);
  const page = await context.newPage();
  const app = opts.app ?? appFor(role);
  await signIn(page, app, opts.email ?? SMOKE_USERS[role], opts.password);
  return { context, page, app };
}

/** Collect console errors and failed API responses for the bug log. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && /\/api\//.test(r.url())) {
      errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  return errors;
}

let sqlClient: ((q: string, params?: unknown[]) => Promise<any[]>) | null = null;

/**
 * Read-only staging DB readback, used as db-row evidence AFTER the UI
 * step. Never use it to create the state a journey is testing.
 */
export async function stagingSql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!IS_STAGING) throw new Error("stagingSql only runs against staging");
  if (!sqlClient) {
    const env = loadEnvLocal();
    const ref = env.STAGING_SUPABASE_REF;
    const password = env.STAGING_DB_PASSWORD;
    if (!ref || !password) throw new Error("STAGING_SUPABASE_REF / STAGING_DB_PASSWORD missing");
    const req = createRequire(resolve("packages/db/package.json"));
    const postgres = req("postgres");
    const sql = postgres(stagingDbUrl(env), { max: 1, ssl: "require", prepare: false });
    sqlClient = (q, p = []) => sql.unsafe(q, p as any[]);
  }
  return (await sqlClient(query, params)) as T[];
}

/**
 * Staging Postgres URL for read-only readback. Uses the IPv4 session
 * pooler: db.<ref>.supabase.co is IPv6-only, and some ISPs hijack its
 * DNS, which made readbacks time out (round 7). Override with
 * E2E_STAGING_DB_URL.
 */
export function stagingDbUrl(env: Record<string, string | undefined>): string {
  if (env.E2E_STAGING_DB_URL) return env.E2E_STAGING_DB_URL;
  const ref = env.STAGING_SUPABASE_REF;
  const password = env.STAGING_DB_PASSWORD;
  if (!ref || !password) throw new Error("STAGING_SUPABASE_REF / STAGING_DB_PASSWORD missing");
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;
}

export function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  const file = resolve(".env.local");
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1 || line.startsWith("#")) continue;
    out[line.slice(0, i)] ??= line.slice(i + 1).replace(/^"|"$/g, "");
  }
  return out;
}

/**
 * fetch() for *.supabase.co from the test runner. The local ISP hijacks
 * that DNS; the browser gets `--host-resolver-rules` from
 * playwright.config.ts, and this gives Node the same pin: connect to
 * E2E_SUPABASE_IP but keep the real hostname for TLS and the Host header.
 * Without E2E_SUPABASE_IP it is plain fetch().
 */
export async function supabaseFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  const ip = process.env.E2E_SUPABASE_IP;
  const u = new URL(url);
  if (!ip || !/\.supabase\.co$/.test(u.hostname)) {
    const r = await fetch(url, init);
    return { ok: r.ok, status: r.status, json: () => r.json(), text: () => r.text() };
  }
  return new Promise((done, fail) => {
    const req = https.request(
      {
        host: u.hostname,
        servername: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: init.method ?? "GET",
        headers: {
          ...(init.headers ?? {}),
          host: u.hostname,
          ...(init.body ? { "content-length": String(Buffer.byteLength(init.body)) } : {})
        },
        // Node >= 20 calls lookup with { all: true } and expects an address list.
        lookup: ((_h: string, opts: { all?: boolean } | number | undefined, cb: (...args: unknown[]) => void) =>
          typeof opts === "object" && opts?.all
            ? cb(null, [{ address: ip, family: 4 }])
            : cb(null, ip, 4)) as unknown as import("node:net").LookupFunction
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          done({ ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) });
        });
      }
    );
    req.on("error", fail);
    if (init.body) req.write(init.body);
    req.end();
  });
}

/**
 * Click a sidebar link the way a user would: sidebar groups are
 * collapsible (<details>), so open the group that holds it first.
 */
export async function openNav(page: Page, name: RegExp) {
  const link = page.locator("nav").getByRole("link", { name }).first();
  if (!(await link.isVisible().catch(() => false))) {
    // Only closed groups: clicking an open group's summary would close it.
    const groups = page.locator("nav details:not([open]) > summary, nav button[aria-expanded=false]");
    // Opening a group removes it from the closed list, so walk by position
    // over a snapshot of the count and skip ones that are not visible.
    const n = await groups.count();
    for (let i = 0, k = 0; i < n && k < (await groups.count()); i++) {
      const g = groups.nth(k);
      if (!(await g.isVisible().catch(() => false))) { k++; continue; }
      await g.click();
      if (await link.isVisible().catch(() => false)) break;
    }
  }
  await link.click();
}
