import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect as baseExpect } from "@playwright/test";
import { CFG, OUT, TARGET, SUPABASE_IP, call, login, sql } from "./lib.mjs";
const expect = baseExpect.configure({ timeout: 30_000 });

if (TARGET !== "staging") throw new Error("Regional substitute rehearsal is staging-only");
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const tag = randomUUID().slice(0, 8), gameId = randomUUID(), regionId = randomUUID();
const leagueId = randomUUID(), seasonId = randomUUID(), divisionId = randomUUID();
const proofId = randomUUID(), entryId = randomUUID(), checks = [];
const player = ids.players["Team Charlie"].find(person => person.rostered);
const captain = ids.captains["Team Alpha"], password = `Play!${ids.tag}x9`;
assert.ok(player?.personId && captain?.email);
let originalDivision, membership, originalPerson, fixtures = false;
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
async function as(app, email, pw) {
  const base = app === "superadmin" ? "https://staging-superadmin.sportspulse.us" : CFG.apps[app];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const url = new URL("/sign-in", base);
  url.searchParams.set("x-vercel-protection-bypass", CFG.bypass(app));
  url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.toString());
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill(pw);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
  return { context, page, base };
}
async function fits(page, label) {
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} fits ${width}px`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
try {
  // Use the existing connected QA organization, never a customer record.
  const [org] = await sql`select display_name from orgs where id=${ids.orgId}`;
  assert.match(org?.display_name ?? "", /PPHL Staging/);
  const [source] = await sql`select g.* from games g where g.season_id=${ids.seasonId}
    and g.home_team_id=${ids.teams["Team Alpha"].id} and g.away_team_id=${ids.teams["Team Bravo"].id} limit 1`;
  assert.ok(source?.division_id);
  [originalDivision] = await sql`select id,region_id,tier from divisions where id=${source.division_id}`;
  [membership] = await sql`select * from team_memberships where person_id=${player.personId} and season_id=${ids.seasonId} and current_status='active' limit 1`;
  [originalPerson] = await sql`select dob_date::text,gender_self_id from persons where id=${player.personId}`;
  assert.ok(membership && originalPerson);
  await sql.begin(async tx => {
    await tx`insert into regions(id,org_id,name) values(${regionId},${ids.orgId},${`QA Regional ${tag}`})`;
    await tx`update divisions set region_id=${regionId},tier='A' where id=${source.division_id}`;
    await tx`insert into leagues select (jsonb_populate_record(null::leagues,to_jsonb(l)||jsonb_build_object('id',${leagueId}::text,'name',${`QA Regional Source ${tag}`}::text))).* from leagues l where id=${source.league_id}`;
    await tx`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s)||jsonb_build_object('id',${seasonId}::text,'league_id',${leagueId}::text,'name',${`QA Regional Season ${tag}`}::text,'metadata','{}'::jsonb))).* from seasons s where id=${ids.seasonId}`;
    await tx`insert into divisions select (jsonb_populate_record(null::divisions,to_jsonb(d)||jsonb_build_object('id',${divisionId}::text,'season_id',${seasonId}::text))).* from divisions d where id=${source.division_id}`;
    await tx`insert into division_team_entries select (jsonb_populate_record(null::division_team_entries,to_jsonb(e)||jsonb_build_object('id',${entryId}::text,'division_id',${divisionId}::text,'invoice_id',null))).* from division_team_entries e join divisions d on d.id=e.division_id where e.team_id=${membership.team_id} and d.season_id=${ids.seasonId} and e.left_at is null limit 1`;
    await tx`update team_memberships set season_id=${seasonId} where id=${membership.id}`;
    await tx`update persons set dob_date='1990-01-01',gender_self_id='male' where id=${player.personId}`;
    await tx`insert into identity_verifications(id,person_id,governing_body_id,external_id,status,source,verified_at,expires_at)
      select ${proofId},${player.personId},id,${`QA-${tag}`},'verified','document_upload',now(),'2099-01-01' from governing_bodies where code='USA_HOCKEY'`;
    await tx`insert into games select (jsonb_populate_record(null::games,to_jsonb(g)||jsonb_build_object('id',${gameId}::text,
      'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual','status','scheduled','locked_at',null,
      'published_at',now(),'finalized_at',null,'game_type','regular','home_score',0,'away_score',0,
      'scheduled_start_ts_utc','2026-11-20T15:00:00Z','duration_min',60,'tz','America/New_York','metadata','{}'::jsonb))).* from games g where id=${source.id}`;
  });
  fixtures = true;
  const playerToken = await login(player.email, password), capToken = await login(captain.email, password);
  const p = await as("player", player.email, password);
  const preferences = p.page.locator('section[aria-labelledby="regional-player-title"]');
  await preferences.locator("summary").click();
  await preferences.getByLabel("Region", { exact: true }).selectOption(regionId);
  await preferences.getByRole("checkbox", { name: /Send me approved/ }).check();
  await preferences.getByRole("checkbox", { name: "Goalie", exact: true }).check();
  await preferences.getByRole("button", { name: "Save preferences" }).click();
  await expect(preferences.getByText("Your regional preferences are saved.")).toBeVisible();
  checks.push("Player opts into goalie invitations in a region through the player app.");
  const c = await as("team", captain.email, password);
  await c.page.goto(`${c.base}/schedule/${gameId}/subs`);
  const requestPanel = c.page.locator('section[aria-labelledby="regional-request-title"]');
  await requestPanel.getByRole("button", { name: "Ask staff to find a sub" }).click();
  await requestPanel.getByLabel("Note for the invitation").fill(`QA goalie request ${tag}`);
  await requestPanel.getByRole("button", { name: "Submit for staff review" }).click();
  await expect(requestPanel.getByText("Waiting for staff review")).toBeVisible();
  await fits(c.page, "Captain request");
  const [request] = await sql`select id from substitute_broadcasts where game_id=${gameId}`; assert.ok(request);
  assert.equal((await sql`select id from substitute_broadcast_recipients where broadcast_id=${request.id}`).length, 0);
  const rejectedReview = await call("POST", `/admin/regional-subs/requests/${request.id}/review`, { action: "approve" }, capToken);
  assert.ok([403, 404].includes(rejectedReview.status));
  checks.push("Captain submits for review; players receive no invitations before approval and the captain cannot self-approve.");
  const sa = await as("superadmin", CFG.superAdmin.email, CFG.superAdmin.password);
  await sa.page.goto(`${sa.base}/substitutes`);
  await expect(sa.page.getByText(`QA goalie request ${tag}`)).toBeVisible();
  await fits(sa.page, "Super admin approval queue");
  const admin = await as("org", CFG.orgAdmin.email, CFG.orgAdmin.password);
  await admin.page.goto(`${admin.base}/substitutes`);
  const card = admin.page.locator("section").filter({ hasText: `QA goalie request ${tag}` });
  await expect(card.getByRole("button", { name: "Approve and send invitations" })).toBeVisible();
  await fits(admin.page, "Organization approval queue");
  await admin.page.screenshot({ path: `${OUT}/regional-staff-review.png`, fullPage: true });
  await card.getByRole("button", { name: "Approve and send invitations" }).click();
  await expect(admin.page.getByText(`QA goalie request ${tag}`)).toHaveCount(0);
  checks.push("The same request appears in both staff consoles; the organization administrator approves it.");
  await p.page.reload();
  const offer = p.page.locator('section[aria-labelledby="regional-player-title"] article').filter({ hasText: `QA goalie request ${tag}` });
  await expect(offer.getByRole("button", { name: "I can play" })).toBeVisible();
  await fits(p.page, "Player invitation");
  await p.page.screenshot({ path: `${OUT}/regional-player-invitation.png`, fullPage: true });
  await offer.getByRole("button", { name: "I can play" }).click();
  await expect(offer.getByText("You're confirmed", { exact: true })).toBeVisible();
  assert.equal((await sql`select id from game_attendance where game_id=${gameId} and person_id=${player.personId} and is_guest=true`).length, 1);
  await p.page.goto(`${p.base}/schedule`);
  await expect(p.page.getByRole("heading", { name: "Confirmed substitute games", exact: true })).toBeVisible();
  await expect(p.page.locator('section[aria-labelledby="regional-player-title"]')).toContainText(`QA goalie request ${tag}`);
  await fits(p.page, "Player schedule with a confirmed substitute game");
  assert.equal((await call("GET", "/regional-subs/confirmed", undefined, capToken)).json.invitations.length, 0);
  const raw = await call("GET", `/captain/regional-subs/${source.home_team_id}/games/${gameId}`, undefined, capToken);
  assert.equal(raw.status, 200);
  for (const field of ["email", "dob", "availability", "externalId"]) assert.equal(JSON.stringify(raw.json).includes(`"${field}"`), false);
  assert.ok([403, 404].includes((await call("GET", "/admin/regional-subs/pending", undefined, playerToken)).status));
  await c.page.reload();
  await expect(requestPanel.getByText("Substitute confirmed", { exact: true })).toBeVisible();
  await expect(requestPanel.getByText(/On your guest lineup:/)).toContainText(player.name);
  await c.page.screenshot({ path: `${OUT}/regional-captain-confirmed.png`, fullPage: true });
  checks.push("A volunteer from another league accepts, appears once on the guest lineup, and is visible to the captain without exposing contacts; player cannot read the approval queue.");
  writeFileSync(`${OUT}/regional-substitutes-browser.json`, JSON.stringify({ tag, checks, passed: checks.length, outcome: "passed" }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }));
} catch (error) {
  let index = 0;
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: `${OUT}/regional-failure-${index++}.png`, fullPage: true }).catch(() => {});
  }
  writeFileSync(`${OUT}/regional-substitutes-browser.json`, JSON.stringify({ tag, checks, outcome: "failed", error: String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
  if (fixtures) await sql.begin(async tx => {
    await tx`delete from notifications where payload->>'gameId'=${gameId}`;
    await tx`delete from roster_moves where metadata->>'gameId'=${gameId}`;
    await tx`delete from games where id=${gameId}`;
    await tx`delete from substitute_subscriptions where region_id=${regionId}`;
    await tx`delete from identity_verifications where id=${proofId}`;
    await tx`update team_memberships set season_id=${membership.season_id} where id=${membership.id}`;
    await tx`update persons set dob_date=${originalPerson.dob_date},gender_self_id=${originalPerson.gender_self_id} where id=${player.personId}`;
    await tx`delete from division_team_entries where id=${entryId}`;
    await tx`delete from divisions where id=${divisionId}`;
    await tx`delete from seasons where id=${seasonId}`;
    await tx`delete from leagues where id=${leagueId}`;
    await tx`update divisions set region_id=${originalDivision.region_id},tier=${originalDivision.tier} where id=${originalDivision.id}`;
    await tx`delete from regions where id=${regionId}`;
  });
  await sql.end({ timeout: 5 });
}
