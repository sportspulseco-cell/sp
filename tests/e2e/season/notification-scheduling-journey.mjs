import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { CFG, OUT, TARGET, SUPABASE_IP, env, call, login, sql } from "./lib.mjs";
import { resendRequest } from "./delivery-lib.mjs";

if (TARGET !== "staging") throw new Error("Connected notification acceptance is staging-only");
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const tag = randomUUID().slice(0, 8), qa = {}, checks = [], mail = [];
const name = `QA Delivery Hockey ${tag}`, venueName = `QA Delivery Rink ${tag}`, pw = `Play!${ids.tag}x9`;
const captain = ids.captains["Team Alpha"], player = ids.players["Team Alpha"].find(person => person.rostered);
const testInbox = env.STAGING_NOTIFICATION_TEST_INBOX;
assert.ok(testInbox && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testInbox), "Configure the user-confirmed staging test inbox");
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
let adminToken, originalProfile;
function passed(message) { checks.push(message); console.log(`PASS ${message}`); }
async function api(method, path, body, token = adminToken) {
  const result = await call(method, path, body, token);
  assert.ok(result.status < 300, `${method} ${path}: ${result.status} ${JSON.stringify(result.json).slice(0, 300)}`);
  return result.json;
}
async function as(app, email, password) {
  const base = app === "superadmin" ? "https://staging-superadmin.sportspulse.us" : CFG.apps[app];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(90_000);
  const url = new URL("/sign-in", base); url.searchParams.set("x-vercel-protection-bypass", CFG.bypass(app)); url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.toString()); await page.locator("input[type=email]").fill(email); await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click(); await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
  return { context, page, base };
}
async function fits(page, label) {
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} fits ${width}px`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
async function waitFor(fn, label, timeout = 90_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const result = await fn(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 1200)); }
  throw new Error(`Timed out: ${label}`);
}
async function deliveredFor(eventMatch) {
  const notice = await waitFor(async () => {
    const rows = await sql`select id,status,provider_message_id,delivery_status,source_event,attempt_count from notifications
      where payload->>'seasonId'=${qa.seasonId} and recipient_person_id=${originalProfile.person_id}
      order by created_at desc`;
    return rows.find(row => eventMatch(row.source_event) && row.delivery_status === "delivered");
  }, "signed provider delivery callback");
  const provider = await resendRequest(`emails/${notice.provider_message_id}`);
  assert.equal(provider.last_event, "delivered");
  mail.push({ notificationId: notice.id, providerId: notice.provider_message_id, event: notice.source_event, outcome: notice.delivery_status });
  return notice;
}
try {
  const [org] = await sql`select display_name from orgs where id=${ids.orgId}`; assert.match(org?.display_name ?? "", /PPHL Staging/);
  const landing = await browser.newContext(); const landingPage = await landing.newPage();
  const landingUrl = new URL("https://staging.sportspulse.us"); landingUrl.searchParams.set("x-vercel-protection-bypass", CFG.bypass("landing"));
  assert.ok((await landingPage.goto(landingUrl.toString()))?.ok());
  passed("The landing app opens before the connected staff/captain/player workflow.");
  adminToken = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  const staffToken = await login(CFG.superAdmin.email, CFG.superAdmin.password), playerToken = await login(player.email, pw);
  const copied = await api("POST", `/registration-v2/seasons/${ids.seasonId}/duplicate`, {
    name, newLeagueName: name, startDate: "2026-11-06", copyTeamEntries: true, requestId: randomUUID(),
  }); Object.assign(qa, copied);
  const [division] = await sql`select id from divisions where season_id=${qa.seasonId} and name='Div A'`;
  const [other] = await sql`select id from divisions where season_id=${qa.seasonId} and name='Div B'`; assert.ok(division && other);
  qa.divisionId = division.id;
  // These are explicit QA roster fixtures, not copied registrations or payments.
  await sql`insert into team_memberships select (jsonb_populate_record(null::team_memberships,to_jsonb(m)||jsonb_build_object('id',gen_random_uuid()::text,'season_id',${qa.seasonId}::text))).*
    from team_memberships m where m.season_id=${ids.seasonId} and m.current_status='active' and m.effective_to is null`;
  [originalProfile] = await sql`select pr.id,pr.email,pe.id person_id from profiles pr join auth.users u on u.id=pr.id join persons pe on pe.user_id=u.id where u.email=${captain.email} limit 1`;
  assert.ok(originalProfile); assert.match(originalProfile.email, /^staging-e2e\+/);
  // Only this synthetic captain's QA profile is temporarily addressed to
  // the inbox explicitly confirmed by the user. Auth sign-in stays unchanged.
  await sql`update profiles set email=${testInbox} where id=${originalProfile.id}`;
  qa.venueId = (await api("POST", "/scheduling/venues", { orgId: ids.orgId, name: venueName, timezone: "America/New_York" })).id;
  qa.surfaceId = (await api("POST", `/scheduling/venues/${qa.venueId}/surfaces`, { label: "Main ice" })).id;
  for (const time of ["09:00", "10:30"]) await api("POST", `/scheduling/surfaces/${qa.surfaceId}/ice-slots/bulk`, {
    seasonId: qa.seasonId, startDate: "2026-11-21", endDate: "2026-12-26", weekdays: [6], startLocalTime: time, durationMin: 75,
  });
  await api("POST", `/league/seasons/${qa.seasonId}/status`, { status: "in_progress" });
  const oa = await as("org", CFG.orgAdmin.email, CFG.orgAdmin.password);
  const sa = await as("superadmin", CFG.superAdmin.email, CFG.superAdmin.password);
  const cap = await as("team", captain.email, pw), pl = await as("player", player.email, pw);
  let failTeams = true, failBlackouts = true, teamRequests = [];
  await oa.page.route("**/api/league/teams?**", async route => {
    const id = new URL(route.request().url()).searchParams.get("divisionId"); if (!id) return route.continue();
    teamRequests.push(id);
    return failTeams ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA team list unavailable" }) }) : route.continue();
  });
  await oa.page.route(`**/api/scheduling/seasons/${qa.seasonId}/blackouts`, route => route.request().method() === "GET" && failBlackouts ?
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA blackout list unavailable" }) }) : route.continue());
  await oa.page.goto(`${oa.base}/scheduling/${qa.seasonId}/generate`);
  await expect(oa.page.getByRole("alert").filter({ hasText: "QA team list unavailable" })).toBeVisible();
  await expect(oa.page.getByRole("alert").filter({ hasText: "QA blackout list unavailable" })).toBeVisible();
  await expect(oa.page.getByText("No blackout dates yet", { exact: true })).toHaveCount(0);
  await expect(oa.page.getByRole("button", { name: "Generate", exact: true })).toBeDisabled();
  failTeams = false; failBlackouts = false;
  await oa.page.getByRole("button", { name: "Retry teams" }).click();
  await oa.page.getByRole("button", { name: "Retry blackout dates" }).click();
  await expect(oa.page.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
  assert.ok(teamRequests.every(id => id === division.id), "Unselected divisions must not preload their rosters");
  passed("Failed team/blackout loads are visible, cannot look empty, block generation, and recover through retry.");
  await oa.page.getByLabel("Division", { exact: true }).selectOption(other.id);
  await expect(oa.page.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
  await oa.page.getByText("Team preferences and unavailable dates", { exact: true }).click();
  await expect(oa.page.getByLabel("Team", { exact: true }).getByRole("option", { name: /Team Echo/ })).toHaveCount(1);
  await expect(oa.page.getByLabel("Team", { exact: true }).getByRole("option", { name: /Team Alpha/ })).toHaveCount(0);
  await oa.page.getByLabel("Division", { exact: true }).selectOption(division.id);
  await expect(oa.page.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
  await oa.page.getByLabel("First day", { exact: true }).fill("2026-12-26");
  await oa.page.getByLabel("Reason", { exact: true }).fill(`QA holiday ${tag}`);
  await oa.page.getByRole("button", { name: "Add blackout" }).click();
  await expect(oa.page.getByRole("list", { name: "Blackout dates" })).toContainText(`QA holiday ${tag}`);
  await fits(oa.page, "Organization schedule generation");
  await oa.page.screenshot({ path: `${OUT}/delivery-scheduling-generation.png`, fullPage: true });
  passed("Division changes load only that division's teams; blackout editing and schedule controls fit mobile through desktop.");
  await oa.page.getByLabel("Max games per team per week", { exact: true }).fill("2");
  const generated = oa.page.waitForResponse(response => response.url().includes("scheduler-generate") && response.request().method() === "POST", { timeout: 120_000 });
  await oa.page.getByRole("button", { name: "Generate", exact: true }).click();
  const generatedHttp = await generated; assert.ok(generatedHttp.ok(), await generatedHttp.text());
  await expect(oa.page.getByText("Draft schedule ready", { exact: true })).toBeVisible();
  const [drafts] = await sql`select count(*)::int count,count(*) filter(where published_at is not null)::int published from games where season_id=${qa.seasonId}`;
  assert.equal(drafts.count, 6); assert.equal(drafts.published, 0);
  assert.equal((await sql`select id from games where season_id=${qa.seasonId} and (scheduled_start_ts_utc at time zone 'America/New_York')::date='2026-12-26'`).length, 0);
  passed("The actual solver creates six draft games and respects the saved holiday blackout before publication.");
  await sa.page.goto(`${sa.base}/scheduling/${qa.seasonId}/runs`); await expect(sa.page.getByRole("main")).toContainText(/completed/i);
  await oa.page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(oa.page.getByRole("button", { name: "Published", exact: true })).toBeVisible();
  const publication = await deliveredFor(event => /schedule.*published/.test(event));
  const beforeRetry = publication.provider_message_id;
  await api("POST", `/notifications/${publication.id}/retry`, undefined, staffToken);
  assert.equal((await sql`select provider_message_id,attempt_count from notifications where id=${publication.id}`)[0].provider_message_id, beforeRetry);
  passed("Publication delivers a labelled test notice to the confirmed inbox through Resend and a signed callback; retry preserves its provider identity.");
  for (const actor of [cap, pl]) {
    await actor.page.goto(`${actor.base}/schedule`); await expect(actor.page.getByRole("main")).toContainText(venueName);
    await actor.page.goto(`${actor.base}/notifications`); await expect(actor.page.getByRole("main")).toContainText(name);
  }
  passed("The same published season appears on captain/player schedules and in their own notification inboxes.");
  let conflictFailure = true;
  await oa.page.route("**/functions/v1/scheduler-conflicts-list", route => conflictFailure ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA conflict detector unavailable" }) }) : route.continue());
  await oa.page.goto(`${oa.base}/scheduling/${qa.seasonId}/conflicts`);
  await expect(oa.page.getByText("Check unavailable", { exact: true })).toBeVisible();
  await expect(oa.page.getByText("No conflicts", { exact: true })).toHaveCount(0);
  conflictFailure = false; await oa.page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(oa.page.getByText("No team-overlap conflicts", { exact: true })).toBeVisible();
  passed("A failed conflict check never reports green; refresh recovers the real no-conflict result.");
  const [game] = await sql`select id,home_team_id,away_team_id from games where season_id=${qa.seasonId} and (home_team_id=${ids.teams["Team Alpha"].id} or away_team_id=${ids.teams["Team Alpha"].id}) order by scheduled_start_ts_utc limit 1`;
  const [scorer] = await sql`select person_id from team_memberships where season_id=${qa.seasonId} and team_id=${game.home_team_id} and current_status='active' limit 1`;
  await api("POST", `/games/${game.id}/start`, {});
  await api("POST", "/game-events", { gameId: game.id, eventType: "goal", period: 1, teamId: game.home_team_id,
    primaryPersonId: scorer.person_id, secondaryPersonIds: [], idempotencyKey: `qa-delivery-goal-${tag}` });
  await sa.page.goto(`${sa.base}/games/${game.id}`); await sa.page.getByRole("button", { name: "Finalize", exact: true }).click();
  const finalDialog = sa.page.getByRole("dialog", { name: "Finalize game" });
  await finalDialog.getByRole("radio", { name: "Regulation", exact: true }).check();
  await finalDialog.getByRole("button", { name: "Confirm final score" }).click(); await expect(finalDialog).toHaveCount(0);
  await deliveredFor(event => /game.*finalized/.test(event));
  await pl.page.goto(`${pl.base}/stats`); await expect(pl.page.getByRole("main")).toContainText(/Stats|Goals/);
  passed("A logged goal, staff finalization, rebuilt player stats and a delivered result notice complete the same season flow.");
  await sa.page.goto(`${sa.base}/communications`);
  const row = sa.page.getByRole("row").filter({ hasText: "Delivered" }).first(); await expect(row).toBeVisible();
  await fits(sa.page, "Delivery outbox"); await sa.page.screenshot({ path: `${OUT}/delivery-outbox-confirmed.png`, fullPage: true });
  assert.equal((await call("GET", "/notifications/summary", undefined, playerToken)).status, 403);
  await pl.page.goto(`${pl.base}/payments`); await expect(pl.page.getByText(/Card payments and refunds are simulated/)).toBeVisible();
  assert.equal((await sql`select id from invoices where season_id=${qa.seasonId}`).length, 0);
  passed("Staff sees confirmed delivery, players cannot read global delivery totals, and mock payments remain unchanged with no fixture invoices.");
  writeFileSync(`${OUT}/notification-scheduling-browser.json`, JSON.stringify({ tag, checks, passed: checks.length, mail, outcome: "passed" }, null, 2));
} catch (error) {
  writeFileSync(`${OUT}/notification-scheduling-browser.json`, JSON.stringify({ tag, qa, checks, mail, outcome: "failed", error: String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
  if (originalProfile) await sql`update profiles set email=${originalProfile.email} where id=${originalProfile.id}`;
  if (!qa.leagueId) { const [league] = await sql`select id from leagues where name=${name} and org_id=${ids.orgId}`; qa.leagueId = league?.id; }
  if (qa.leagueId) await sql.begin(async tx => {
    const seasons = await tx`select id from seasons where league_id=${qa.leagueId}`;
    for (const season of seasons) {
      await tx`delete from notifications where payload->>'seasonId'=${season.id}`;
      await tx`delete from games where season_id=${season.id}`;
      await tx`delete from team_memberships where season_id=${season.id}`;
      await tx`delete from division_team_entries where division_id in (select id from divisions where season_id=${season.id})`;
    }
    // The explicit QA clone and its dependent forms/prices are retained as
    // archived review data; no customer league or original roster is changed.
    await tx`update seasons set status='archived' where league_id=${qa.leagueId}`;
    await tx`update leagues set status='archived' where id=${qa.leagueId}`;
  });
  if (qa.venueId) await sql.begin(async tx => {
    await tx`delete from ice_slots where surface_id in (select id from surfaces where venue_id=${qa.venueId})`;
    await tx`delete from surfaces where venue_id=${qa.venueId}`; await tx`delete from venues where id=${qa.venueId}`;
  });
  await sql.end({ timeout: 5 });
}
