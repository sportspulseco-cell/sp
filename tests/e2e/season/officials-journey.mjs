// Two synthetic accounts; profile emails are cleared so rehearsal notices stay in-app.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { CFG, ROOT, OUT, TARGET, SUPABASE_IP, env, pinnedRequest, q, sql, call, login } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Officials rehearsal is staging-only");
const { createClient } = createRequire(path.join(ROOT, "apps/superadmin-api/package.json"))("@supabase/supabase-js");
const auth = createClient(CFG.supabaseUrl, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: async (url, init) => {
    const response = await pinnedRequest(String(url), { method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers)), body: init?.body ?? "" });
    return new Response(response.status === 204 ? null : response.body, { status: response.status, headers: { "content-type": "application/json" } });
  } },
});
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const checks = [], users = [], people = [], tokens = [];
const roleId = randomUUID(), code = `qa_official_assigner_${randomUUID().slice(0, 8)}`;
const password = `QA!${randomUUID()}a9`;
let failure = null;
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
async function account(name, roles) {
  const email = `qa-official-${randomUUID()}@example.invalid`;
  const { data, error } = await auth.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: name }, app_metadata: { role_codes: roles } });
  if (error) throw new Error(`Create staging official fixture failed: ${error.code ?? error.status}`);
  const id = data.user.id; users.push(id);
  await q("update profiles set email=null,display_name=$2 where id=$1", [id, name]);
  const existing = await q("select id from persons where user_id=$1 limit 1", [id]);
  const personId = existing[0]?.id ?? randomUUID();
  if (!existing.length) await q("insert into persons(id,user_id,legal_first_name,legal_last_name) values($1,$2,$3,$4)", [personId, id, ...name.split(" ")]);
  people.push(personId);
  return { id, email, personId };
}
async function consoleAs(user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const url = new URL("/sign-in", "https://staging-superadmin.sportspulse.us");
  url.searchParams.set("x-vercel-protection-bypass", CFG.bypass("superadmin")); url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.toString()); await page.locator("input[type=email]").fill(user.email);
  await page.locator("input[type=password]").fill(password); await page.locator("button[type=submit]").click();
  await page.waitForURL(u => u.pathname === "/games");
  return { context, page };
}
try {
  const [game] = await q("select id,scheduled_start_ts_utc,duration_min from games where season_id=$1 and status='scheduled' and scheduled_start_ts_utc>now() order by scheduled_start_ts_utc,id limit 1", [ids.seasonId]);
  assert.ok(game);
  await q("insert into roles(id,org_id,code,name,is_system,permissions) values($1,$2,$3,'QA Officials Assigner',false,$4::jsonb)", [roleId, ids.orgId, code, JSON.stringify(["game.read", "game.assign_officials"])]);
  const assigner = await account("Jordan Ellis", [code]); const official = await account("Taylor Brooks", ["referee"]);
  await q("insert into user_role_assignments(user_id,role_id,scope_type,scope_id) values($1,$2,'game',$3)", [assigner.id, roleId, game.id]);
  await q("insert into user_role_assignments(user_id,role_id,scope_type,scope_id) select $1,id,'game',$2 from roles where code='referee' and is_system=true limit 1", [official.id, game.id]);
  const at = await login(assigner.email, password), ot = await login(official.email, password); tokens.push(at, ot);
  const mine = await call("GET", "/games?assignedToMe=true&limit=100", undefined, at);
  assert.equal(mine.status, 200); assert.deepEqual(mine.json.items.map(g => g.id), [game.id]);
  for (const route of ["/iam/persons", "/finance/invoices", `/games/${ids.games[0].id}`]) {
    const response = await call("GET", route, undefined, at); assert.ok([403, 404].includes(response.status), `Restricted route ${route} returned ${response.status}`);
  }
  assert.equal((await call("POST", `/games/${game.id}/start`, {}, at)).status, 403);
  checks.push("Custom game-scoped assigner sees one game and cannot browse people, finance, other games or start play.");
  const start = new Date(game.scheduled_start_ts_utc), end = new Date(start.getTime() + (game.duration_min ?? 60) * 60000);
  assert.equal((await call("POST", "/game-officials/availability/me", { periods: [{ startTsUtc: start.toISOString(), endTsUtc: end.toISOString() }] }, ot)).status, 201);
  const unavailable = await call("GET", `/games/${game.id}/official-candidates`, undefined, at);
  assert.equal(unavailable.status, 200); assert.ok(unavailable.json.find(p => p.personId === official.personId)?.busyWith);
  assert.equal((await call("POST", `/games/${game.id}/officials`, { personId: official.personId, role: "referee" }, at)).status, 409);
  await call("POST", "/game-officials/availability/me", { periods: [] }, ot);
  checks.push("Private unavailability marks the candidate busy and blocks an ordinary assignment.");
  const a = await consoleAs(assigner);
  await a.page.goto(`https://staging-superadmin.sportspulse.us/games/${game.id}`);
  await a.page.getByRole("button", { name: "Assign", exact: true }).click();
  await a.page.locator("#ao-person").selectOption(official.personId);
  await expect(a.page.locator("#ao-status")).toHaveValue("tentative");
  const assignmentResponse = a.page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/games/${game.id}/officials`));
  await a.page.locator("form:has(#ao-person)").getByRole("button", { name: "Assign", exact: true }).click();
  const assigned = await assignmentResponse; assert.equal(assigned.status(), 201);
  const assignment = await assigned.json(); assert.equal(assignment.status, "tentative");
  checks.push("External assigner uses the limited console to send a tentative official invitation.");
  const o = await consoleAs(official);
  await o.page.goto(`https://staging-superadmin.sportspulse.us/games/${game.id}`);
  const response = o.page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith(`/game-officials/${assignment.id}/status`));
  await o.page.getByRole("button", { name: "Confirm", exact: true }).click();
  const confirmed = await response; assert.equal(confirmed.status(), 200); assert.equal((await confirmed.json()).status, "confirmed");
  await a.page.reload(); await expect(a.page.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  const [notice] = await q("select id from notifications where recipient_person_id=$1 and template_code='game.official_replied' and payload->>'gameId'=$2", [assigner.personId, game.id]);
  assert.ok(notice);
  await a.page.goto("https://staging-superadmin.sportspulse.us/finance");
  await a.page.waitForURL(u => u.pathname === "/games");
  checks.push("Official confirms their invitation; assigner sees the response and receives an in-app notice; admin navigation remains restricted.");
  console.log(checks.map(c => `PASS ${c}`).join("\n"));
} catch (error) { failure = error.message; throw error; }
finally {
  await browser.close();
  for (const token of tokens) await auth.auth.admin.signOut(token, "global");
  if (people.length) {
    await q("delete from notifications where recipient_person_id=any($1::uuid[])", [people]);
    await q("delete from game_officials where person_id=any($1::uuid[])", [people]);
  }
  for (const user of users) await auth.auth.admin.deleteUser(user);
  if (people.length) await q("delete from persons where id=any($1::uuid[])", [people]);
  await q("delete from roles where id=$1", [roleId]);
  writeFileSync(`${OUT}/officials-browser.json`, JSON.stringify({ tag: ids.tag, passed: failure === null, checks, error: failure }, null, 2));
  await sql.end();
}
