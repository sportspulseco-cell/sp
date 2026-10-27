// Shared helpers for the full-season run (tests/e2e/season).
//
// SEASON_TARGET=staging (default): STAGING_* keys from the repo-root
// .env.local, org "PPHL Staging", the deployed staging API.
//
// SEASON_TARGET=production: writes ONLY into "Smoke Test Org" through the
// production API, as the smoke-test users. The API, Supabase and database
// addresses are read from Vercel (VERCEL_TOKEN) at runtime and never
// printed. Every SQL query runs in a READ ONLY transaction: the run changes
// data only through the API, the way a user would. Accounts use
// sportspulse.smoketest+…@gmail.com, which delivers to one real inbox, so
// production mail never bounces.
import fs from "node:fs";
import https from "node:https";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const req = createRequire(path.join(ROOT, "packages/db/package.json"));
const postgres = req("postgres");

export const env = { ...process.env };
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#") && env[l.slice(0, i)] === undefined) env[l.slice(0, i)] = l.slice(i + 1).replace(/^"|"$/g, "");
  }
}
const need = (k) => { if (!env[k]) throw new Error(`season run: ${k} is not set (repo-root .env.local)`); return env[k]; };

export const TARGET = env.SEASON_TARGET ?? "staging";
if (!["staging", "production"].includes(TARGET)) throw new Error(`season run: unknown SEASON_TARGET ${TARGET}`);
const PROD = TARGET === "production";

/** A Vercel project's env value for one target, read through the API. Never logged. */
async function vercelEnv(project, key, target) {
  const H = { Authorization: `Bearer ${need("VERCEL_TOKEN").replace(/["\r]/g, "").trim()}` };
  const slug = "sportspulseco-cells-projects";
  const list = await (await fetch(`https://api.vercel.com/v9/projects/${project}/env?slug=${slug}`, { headers: H })).json();
  const e = (list.envs ?? []).find((x) => x.key === key && (x.target ?? []).includes(target) && !x.gitBranch);
  if (!e) throw new Error(`season run: ${project} has no ${target} ${key}`);
  const one = await (await fetch(`https://api.vercel.com/v1/projects/${project}/env/${e.id}?slug=${slug}`, { headers: H })).json();
  return String(one.value ?? "").trim();
}

/** The smoke-test password the production e2e suite already uses (tests/e2e/fixtures.ts). */
function smokePassword() {
  const src = fs.readFileSync(path.join(ROOT, "tests/e2e/fixtures.ts"), "utf8");
  const m = src.match(/export const SMOKE_PASSWORD = "([^"]+)"/);
  if (!m) throw new Error("season run: SMOKE_PASSWORD not found in tests/e2e/fixtures.ts");
  return m[1];
}

export const CFG = PROD
  ? {
      api: "https://api.sportspulse.us/api",
      supabaseUrl: await vercelEnv("sp-player", "NEXT_PUBLIC_SUPABASE_URL", "production"),
      anonKey: await vercelEnv("sp-player", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "production"),
      dbUrl: await vercelEnv("sp-api", "DATABASE_POOL_URL", "production"),
      orgSlug: "smoke-test-org",
      formSourceSlug: "pphl-demo",
      orgAdmin: { email: "sportspulse.smoketest+oa@gmail.com", password: smokePassword() },
      superAdmin: { email: "sportspulse.smoketest+sa@gmail.com", password: smokePassword() },
      mail: (tag, k) => `sportspulse.smoketest+${tag.toLowerCase()}-${k}@gmail.com`,
      apps: { player: "https://player.sportspulse.us", team: "https://team.sportspulse.us", org: "https://org.sportspulse.us" },
      bypass: () => null
    }
  : {
      api: env.SEASON_API ?? "https://staging-api.sportspulse.us/api",
      supabaseUrl: need("STAGING_SUPABASE_URL"),
      anonKey: need("STAGING_SUPABASE_ANON_KEY"),
      dbUrl: `postgresql://postgres.${need("STAGING_SUPABASE_REF")}:${encodeURIComponent(need("STAGING_DB_PASSWORD"))}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`,
      orgSlug: "pphl-staging",
      formSourceSlug: "pphl-staging",
      orgAdmin: { email: need("STAGING_ORG_EMAIL"), password: need("STAGING_ORG_PASSWORD") },
      superAdmin: { email: need("STAGING_SUPERADMIN_EMAIL"), password: need("STAGING_SUPERADMIN_PASSWORD") },
      mail: (tag, k) => `staging-e2e+${tag.toLowerCase()}-${k}@sportspulse.us`,
      apps: { player: "https://staging-player.sportspulse.us", team: "https://staging-team.sportspulse.us", org: "https://staging-org.sportspulse.us" },
      bypass: (app) => env[`STAGING_VERCEL_BYPASS_${app.toUpperCase()}`] ?? null
    };
export const API = CFG.api;
if (!PROD && !/staging|localhost/.test(API)) throw new Error(`season run: refusing a non-staging API on the staging target (${API})`);

export const OUT = path.join(ROOT, PROD ? "test-results-season-production" : "test-results-season");
fs.mkdirSync(OUT, { recursive: true });

export const sql = postgres(CFG.dbUrl, { max: 2, ssl: "require", prepare: false });
/** Reads. On production each runs in a READ ONLY transaction, so a write fails. */
export const q = (text, params = []) =>
  PROD ? sql.begin("read only", (tx) => tx.unsafe(text, params)) : sql.unsafe(text, params);

export async function call(method, p, body, token) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

export function msgOf(r) {
  const j = r.json;
  if (!j || typeof j !== "object") return String(j);
  return j?.error?.message ?? j?.message ?? JSON.stringify(j).slice(0, 300);
}

// Some ISPs intermittently hijack *.supabase.co; pin the Cloudflare edge.
export const SUPABASE_IP = env.E2E_SUPABASE_IP ?? "172.64.149.246";
export function pinnedRequest(url, { method = "POST", headers = {}, body = "" } = {}) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        host: u.hostname, servername: u.hostname, port: 443, path: u.pathname + u.search, method,
        headers: { ...headers, host: u.hostname, "content-length": Buffer.byteLength(body) },
        lookup: (_h, o, cb) => (o && o.all ? cb(null, [{ address: SUPABASE_IP, family: 4 }]) : cb(null, SUPABASE_IP, 4)),
        timeout: 240000
      },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d })); }
    );
    r.on("error", reject); r.write(body); r.end();
  });
}

export async function login(email, password) {
  const res = await pinnedRequest(`${CFG.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: CFG.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (res.status >= 300) throw new Error(`login ${email}: ${res.status} ${res.body.slice(0, 200)}`);
  return JSON.parse(res.body).access_token;
}

/** Supabase edge function, as the given user. */
export async function edge(fn, body, token) {
  const res = await pinnedRequest(`${CFG.supabaseUrl}/functions/v1/${fn}`, {
    headers: { "content-type": "application/json", apikey: CFG.anonKey, authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = JSON.parse(res.body); } catch { json = res.body; }
  return { status: res.status, json };
}

export function dobYearsAgo(years) {
  const d = new Date();
  return `${d.getUTCFullYear() - years}-03-03`;
}
