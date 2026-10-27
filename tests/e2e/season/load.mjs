// PRODUCTION registration-night load test, bounded. Writes only into "Smoke Test Org"
// through the public API; all SQL is read-only (lib.mjs). Waves of players register and
// pay (mock card) at the same moment; every request is timed; database connections are
// sampled every 2 s. Usage: SEASON_TARGET=production node tests/e2e/season/load.mjs
// Archive the "Load Test L…" league afterwards (league and season status: archived).
import { writeFileSync } from "node:fs";
import { call, login, q, sql, msgOf, dobYearsAgo, CFG, TARGET, OUT } from "./lib.mjs";
if (TARGET !== "production" || CFG.orgSlug !== "smoke-test-org") throw new Error("this load test is for Smoke Test Org on production");

const TAG = `L${Date.now().toString(36).toUpperCase()}`;
const PW = `Play!${TAG}x9`;
const WAVES = [20, 40];
const timings = [];
const timed = async (label, fn) => {
  const t = Date.now();
  const r = await fn();
  timings.push({ label, ms: Date.now() - t, status: r.status });
  return r;
};

const oa = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
const [org] = await q(`select id from orgs where slug = $1`, [CFG.orgSlug]);
const lg = await call("POST", "/league/leagues", { orgId: org.id, sportCode: "HOCKEY_ICE", name: `Load Test ${TAG}` }, oa);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const ss = await call("POST", "/league/seasons", { leagueId: lg.json.id, name: "Load Season", sportCode: "HOCKEY_ICE", startDate: tomorrow, endDate: "2027-02-28", timezone: "America/New_York",
  registrationOpensAt: new Date(Date.now() + 60000).toISOString(), registrationClosesAt: `${tomorrow}T23:00:00.000Z` }, oa);
const seasonId = ss.json.id;
const dv = await call("POST", "/league/divisions", { seasonId, name: "Div L" }, oa);
const [src] = await q(`select f.purpose, f.applies_to_roles, v.schema from registration_forms f join registration_form_versions v on v.id = f.active_version_id
  where f.org_id = (select id from orgs where slug = $1) and f.deleted_at is null and f.season_id is not null and f.purpose = 'season_registration' order by f.created_at desc limit 1`, [CFG.formSourceSlug]);
const fm = await call("POST", "/org-admin/forms", { orgId: org.id, scope: "league", scopeId: lg.json.id, seasonId, name: "Load Registration", purpose: src.purpose, appliesToRoles: src.applies_to_roles ?? undefined }, oa);
const fv = await call("POST", `/org-admin/forms/${fm.json.id}/versions`, { schema: src.schema }, oa);
await call("POST", `/org-admin/forms/${fm.json.id}/versions/${fv.json.id}/publish`, undefined, oa);
const tiers = {};
for (const [k, cents] of [["team", 120000], ["player", 15000]]) {
  const c = await call("POST", "/org-admin/pricing-tiers", { seasonId, name: `${k} fee`, fullPriceCents: cents, audience: k }, oa);
  await call("PATCH", `/org-admin/pricing-tiers/${c.json.id}`, { isActive: true }, oa);
  await call("PUT", `/org-admin/pricing-tier-divisions/${c.json.id}`, { divisionIds: [dv.json.id] }, oa);
  tiers[k] = c.json.id;
}
await call("POST", `/league/seasons/${seasonId}/status`, { status: "registration_open" }, oa);
console.log(`setup: league ${lg.status}, season ${ss.status}, division ${dv.status}, form ${fm.status}; waiting for the window to open`);
await new Promise((r) => setTimeout(r, 65000));

async function register(key, extra, tier) {
  const email = CFG.mail(TAG, key);
  const ctx = await timed("context", () => call("GET", `/public/registration/seasons/${seasonId}${extra.teamId ? `?team=${extra.teamId}` : ""}`));
  if (ctx.status >= 300) return { ok: false, why: `context ${ctx.status}` };
  const s = await timed("start (account + person)", () => call("POST", `/public/registration/seasons/${seasonId}/submissions`, {
    email, password: PW, fullName: `Load ${key}`, dobDate: dobYearsAgo(30), formVersionId: ctx.json.formVersionId, divisionId: dv.json.id, ...extra }));
  if (s.status >= 300) return { ok: false, why: `start ${s.status} ${msgOf(s).slice(0, 100)}` };
  const p = await timed("price", () => call("PATCH", `/public/registration/submissions/${s.json.id}`, { email, pricingTierId: tier }));
  const w = await timed("waivers", () => call("GET", `/public/registration/submissions/${s.json.id}/waivers?email=${encodeURIComponent(email)}`));
  for (const doc of w.json?.documents ?? []) await timed("sign waiver", () => call("POST", `/public/registration/submissions/${s.json.id}/sign-waiver`, { email, key: doc.key, signatureName: `Load ${key}` }));
  const pay = await timed("pay (mock card)", () => call("POST", `/public/registration/submissions/${s.json.id}/pay`, { email }));
  return { ok: p.status < 300 && pay.status < 300, why: pay.status >= 300 ? `pay ${pay.status} ${msgOf(pay).slice(0, 100)}` : p.status >= 300 ? `price ${p.status}` : "", id: s.json.id };
}

const cap = await register("capt", { submissionType: "team", teamName: `Load Team ${TAG}` }, tiers.team);
const ap = await call("POST", `/org-admin/registrations/${cap.id}/review`, { action: "approve" }, oa);
const [team] = await q(`select t.id from teams t where t.name = $1 and t.org_id = $2`, [`Load Team ${TAG}`, org.id]);
console.log(`captain ${cap.ok ? "paid" : cap.why}, approved ${ap.status}, team ${team ? "created" : "MISSING"}`);

const samples = [];
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    const [r] = await q(`select count(*)::int total, count(*) filter (where state = 'active')::int active,
      count(*) filter (where state like 'idle in transaction%')::int idle_tx from pg_stat_activity where datname = current_database()`);
    samples.push({ at: Date.now(), ...r });
    await new Promise((s) => setTimeout(s, 2000));
  }
})();

const report = { tag: TAG, seasonId, waves: [] };
let n = 0;
for (const size of WAVES) {
  const before = timings.length;
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: size }, () => register(`p${++n}`, { submissionType: "individual", teamId: team.id }, tiers.player)));
  const wall = Date.now() - t0;
  const wt = timings.slice(before);
  const by = {};
  for (const x of wt) (by[x.label] ??= []).push(x);
  const stats = Object.fromEntries(Object.entries(by).map(([k, v]) => {
    const ms = v.map((x) => x.ms).sort((a, b) => a - b);
    const pct = (p) => ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))];
    return [k, { n: v.length, p50: pct(50), p95: pct(95), max: ms[ms.length - 1], errors5xx: v.filter((x) => x.status >= 500).length, errors4xx: v.filter((x) => x.status >= 400 && x.status < 500).length }];
  }));
  const failed = results.filter((r) => !r.ok);
  report.waves.push({ size, wallMs: wall, completed: size - failed.length, failed: failed.map((f) => f.why), stats });
  console.log(`\nwave ${size}: ${size - failed.length}/${size} registered and paid in ${(wall / 1000).toFixed(1)} s`);
  for (const [k, s] of Object.entries(stats)) console.log(`  ${k.padEnd(26)} n=${String(s.n).padStart(3)} p50=${s.p50}ms p95=${s.p95}ms max=${s.max}ms 5xx=${s.errors5xx} 4xx=${s.errors4xx}`);
  if (failed.length) console.log("  failures:", JSON.stringify(failed.map((f) => f.why).slice(0, 5)));
  await new Promise((r) => setTimeout(r, 5000));
}
sampling = false;
await sampler;
const peak = samples.reduce((m, s) => (s.total > m.total ? s : m), { total: 0 });
report.db = { samples: samples.length, peakTotal: peak.total, peakActive: Math.max(...samples.map((s) => s.active)), peakIdleInTx: Math.max(...samples.map((s) => s.idle_tx)) };
console.log(`\ndatabase connections: peak ${report.db.peakTotal} total, ${report.db.peakActive} active, ${report.db.peakIdleInTx} idle-in-transaction (${samples.length} samples)`);
const [settled] = await q(`select count(*)::int n, count(*) filter (where status = 'pending_review')::int pending from registrations where season_id = $1`, [seasonId]);
console.log(`readback: ${settled.n} registrations in the season, ${settled.pending} pending review`);
report.readback = settled;
writeFileSync(`${OUT}/load-${TAG}.json`, JSON.stringify({ report, timings, samples }, null, 2));
console.log(`season ${seasonId} league ${lg.json.id} tag ${TAG}`);
await sql.end();
