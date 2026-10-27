// Shared helpers for the full-season run (tests/e2e/season). STAGING ONLY:
// credentials come from the repo-root .env.local (STAGING_* keys) and the
// API defaults to the deployed staging API. Never point this at production.
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
for (const k of ["STAGING_SUPABASE_URL", "STAGING_SUPABASE_ANON_KEY", "STAGING_SUPABASE_REF", "STAGING_DB_PASSWORD", "STAGING_ORG_EMAIL", "STAGING_ORG_PASSWORD"]) {
  if (!env[k]) throw new Error(`season run: ${k} is not set (repo-root .env.local)`);
}

export const API = env.SEASON_API ?? "https://staging-api.sportspulse.us/api";
if (!/staging/.test(API) && !/localhost/.test(API)) throw new Error(`season run: refusing a non-staging API (${API})`);

export const OUT = path.join(ROOT, "test-results-season");
fs.mkdirSync(OUT, { recursive: true });

const dbUrl = `postgresql://postgres.${env.STAGING_SUPABASE_REF}:${encodeURIComponent(env.STAGING_DB_PASSWORD)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;
export const sql = postgres(dbUrl, { max: 2, ssl: "require", prepare: false });
export const q = (text, params = []) => sql.unsafe(text, params);

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
  const res = await pinnedRequest(`${env.STAGING_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.STAGING_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (res.status >= 300) throw new Error(`login ${email}: ${res.status} ${res.body.slice(0, 200)}`);
  return JSON.parse(res.body).access_token;
}

/** Supabase edge function on staging, as the given user. */
export async function edge(fn, body, token) {
  const res = await pinnedRequest(`${env.STAGING_SUPABASE_URL}/functions/v1/${fn}`, {
    headers: { "content-type": "application/json", apikey: env.STAGING_SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
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
