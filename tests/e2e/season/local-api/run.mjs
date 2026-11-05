// Run the API built from the working tree on :4123 against the STAGING database, with the sp-api
// project's staging (preview) environment pulled from Vercel and held in memory, never printed.
// Heavy automated tests run against this, not the deployed apps: on 30 Oct 2026 test traffic used
// up the Vercel CPU allowance and every app went down.
//
//   pnpm --filter ./apps/superadmin-api build
//   node tests/e2e/season/local-api/run.mjs            (keep it running)
//   SEASON_API=http://localhost:4123/api node <your test>.mjs
//
// Needs VERCEL_TOKEN in .env.local. *.supabase.co is pinned to a Cloudflare address (pin-dns.cjs),
// as tests/e2e/season/lib.mjs does, because an ISP here hijacks that domain.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../../..");
const local = Object.fromEntries(readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "").trim()]));
const H = { Authorization: `Bearer ${local.VERCEL_TOKEN}` };
const slug = "sportspulseco-cells-projects";
const list = await (await fetch(`https://api.vercel.com/v9/projects/sp-api/env?slug=${slug}`, { headers: H })).json();
const env = { ...process.env };
let n = 0;
for (const e of list.envs ?? []) {
  // The staging API runs from the codex/staging branch: branch-specific preview values first, then plain preview.
  const forStaging = (e.target ?? []).includes("preview") && (!e.gitBranch || e.gitBranch === "codex/staging");
  if (!forStaging) continue;
  if (env[e.key] !== undefined && !e.gitBranch && list.envs.some((x) => x.key === e.key && x.gitBranch === "codex/staging")) continue;
  const one = await (await fetch(`https://api.vercel.com/v1/projects/sp-api/env/${e.id}?slug=${slug}`, { headers: H })).json();
  if (typeof one.value === "string") { env[e.key] = one.value; n++; }
}
env.API_PORT = "4123";
// Never let a hosted credential or a local .env fallback turn a QA run
// into production traffic or external messages.
const expectedRef = local.STAGING_SUPABASE_REF;
if (!expectedRef || expectedRef === "nmiiqyfwvbcvtwumtwil" ||
    new URL(env.SUPABASE_URL).hostname !== `${expectedRef}.supabase.co` ||
    !decodeURIComponent(new URL(env.DATABASE_POOL_URL).username).includes(expectedRef)) {
  throw new Error("Local QA API must use the staging Auth and database projects.");
}
env.SUPABASE_JWT_SECRET ??= "";
env.SUPABASE_JWKS_URL = `${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
env.SUPABASE_JWT_AUDIENCE = "authenticated";
for (const key of ["RESEND_API_KEY", "TWILIO_AUTH_TOKEN", "VAPID_PRIVATE_KEY"]) env[key] = "";
env.NODE_OPTIONS = `--require ${path.join(here, "pin-dns.cjs")}`;
const dbHost = (env.DATABASE_URL || env.DATABASE_POOL_URL || "").replace(/^.*@/, "").replace(/\/.*$/, "");
console.log(`loaded ${n} staging env values; database host ${dbHost || "(none)"}; starting on :4123`);
const child = spawn(process.execPath, [path.join(ROOT, "apps/superadmin-api/dist/main.js")], { env, stdio: ["ignore", "pipe", "pipe"], cwd: path.join(ROOT, "apps/superadmin-api") });
const scrub = (t) => String(t).replace(/eyJ[A-Za-z0-9_-]{20,}/g, "***");
child.stdout.on("data", (d) => process.stdout.write(scrub(d)));
child.stderr.on("data", (d) => process.stderr.write(scrub(d)));
child.on("exit", (c) => { console.log(`api exited ${c}`); process.exit(c ?? 1); });
