import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect as baseExpect } from "@playwright/test";
import { CFG, TARGET, SUPABASE_IP, call, login, sql, msgOf, env } from "../season/lib.mjs";
import {OUT as BASE_OUT,loadManifest} from "./lib.mjs";
import {mkdirSync} from "node:fs";
const manifest=loadManifest();
const evidenceDir=process.env.UX_EVIDENCE_DIR??"ux-sprint-02";
if(!/^[a-z0-9-]+$/.test(evidenceDir))throw Error("Invalid evidence directory");
const OUT=BASE_OUT+"/"+evidenceDir;mkdirSync(OUT+"/shots",{recursive:true});
CFG.orgAdmin=manifest.accounts.org_admin;
CFG.apps.org=process.env.UX_TARGET==="local"?"http://localhost:3107":CFG.apps.org;
const expect = baseExpect.configure({ timeout: 30_000 });
if (TARGET !== "staging") throw new Error("Guided setup rehearsal is staging-only");
const checks = [], tag = randomUUID().slice(0, 8);
const leagueName = env.GUIDED_LEAGUE_NAME ?? `Harbor Spring Hockey ${tag}`, seasonName = env.GUIDED_SEASON_NAME ?? `Spring 2027 ${tag}`;
// A valid PNG with a large uncompressed text chunk exercises the real
// near-2MB upload body without storing a video or a generated asset.
function largePng() {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=", "base64");
  const data = Buffer.concat([Buffer.from("Comment\0QA upload fixture "), Buffer.alloc(1900000, 65)]);
  const type = Buffer.from("tEXt"), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length);
  let c = 0xffffffff;
  for (const b of Buffer.concat([type, data])) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); }
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([png.subarray(0, -12), length, type, data, crc, png.subarray(-12)]);
}
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
let leagueId, seasonId, admin, page, completed = false;
const diagnostic=setInterval(()=>{if(page)writeFileSync(OUT+"/live.txt",JSON.stringify({path:new URL(page.url()).pathname})+"\n");if(page)page.getByRole("main").innerText().then(t=>writeFileSync(OUT+"/live.txt",t)).catch(()=>{});},15000);
try {
  admin = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  // Local UI uses real staging HTTP through the test runner to avoid a localhost CORS origin.
  // Remote staging runs never intercept requests.
  if(process.env.UX_TARGET==='local')await context.route(CFG.api+'/**',async route=>{
    const request=route.request();const headers=request.headers();delete headers.origin;delete headers.host;
    const response=await fetch(request.url(),{method:request.method(),headers,body:request.postDataBuffer()??undefined});
    await route.fulfill({status:response.status,headers:{'content-type':response.headers.get('content-type')??'application/json'},body:Buffer.from(await response.arrayBuffer())});
  });
  page = await context.newPage(); page.setDefaultTimeout(90000);
  const url = new URL("/sign-in", CFG.apps.org);
  url.searchParams.set("x-vercel-protection-bypass", CFG.bypass("org")); url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.toString());
  await page.locator("input[type=email]").fill(CFG.orgAdmin.email);
  await page.locator("input[type=password]").fill(CFG.orgAdmin.password);
  await page.locator("button[type=submit]").click(); await page.waitForURL(u => !u.pathname.startsWith("/sign-in"));
  await page.goto(`${CFG.apps.org}/org-setup`);
  await expect(page.getByRole("heading",{name:"Which league?"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Next: Season"})).toBeDisabled();
  const visibleFields=async()=>page.locator("main input:visible:not([type=file]),main select:visible,main textarea:visible").count();
  const fields={league:await visibleFields()};
  assert.ok(fields.league<=4);
  await page.getByLabel("League name", { exact: false }).fill(leagueName);
  await page.getByLabel("Sport", { exact: false }).selectOption("HOCKEY_ICE");
  const logoInput = page.getByLabel("Upload league logo");
  await logoInput.setInputFiles({ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert").filter({ hasText: "Choose a PNG" })).toBeVisible();
  const imageResponse = page.waitForResponse(r => /\/users\/[^/]+\/avatar$/.test(new URL(r.url()).pathname) && r.request().method() === "POST");
  await logoInput.setInputFiles({ name: "qa-league-logo.png", mimeType: "image/png", buffer: env.GUIDED_LOGO_PATH ? readFileSync(env.GUIDED_LOGO_PATH) : largePng() });
  const imageHttp = await imageResponse; assert.equal(imageHttp.status(), 201, await imageHttp.text());
  await expect.poll(() => page.getByAltText("League logo preview").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  checks.push(env.GUIDED_LOGO_PATH ? "A local league logo uploads and renders; an image over the limit is refused with a clear message." : "A near-2MB logo uploads and renders; an image over the limit is refused with a clear message.");
  if(process.env.UX_EVIDENCE_DIR)await page.screenshot({path:OUT+"/shots/league-desktop.png",fullPage:true});
  await page.getByRole("button", { name: "Next: Season" }).click();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  await page.getByLabel("Season name", { exact: false }).fill(seasonName);
  await page.getByLabel("Season start date", { exact: false }).fill("2027-01-02");
  await page.getByLabel("Season end date", { exact: false }).fill("2027-04-30");
  if(process.env.UX_EVIDENCE_DIR)await page.screenshot({path:OUT+"/shots/season-desktop.png",fullPage:true});
  fields.dates=await visibleFields();assert.equal(fields.dates,3);
  await page.getByRole('button',{name:'Next: Registration dates'}).click();
  await expect(page.getByLabel('Season name',{exact:false})).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Next: Playoffs'})).toBeDisabled();
  await page.getByLabel('Registration opens',{exact:false}).fill(today);
  await page.getByLabel('Registration closes',{exact:false}).fill('2027-01-01');
  fields.registrationDates=await visibleFields();assert.equal(fields.registrationDates,2);
  await page.reload();await expect(page.getByLabel('Registration opens',{exact:false})).toHaveValue(today);
  await page.getByRole('button',{name:'Next: Playoffs'}).click();
  await expect(page.getByLabel('Registration opens',{exact:false})).not.toBeVisible();
  fields.optionalDates=await visibleFields();assert.equal(fields.optionalDates,0);
  await page.locator('summary').filter({hasText:/^Playoff dates$/}).click();
  await page.getByLabel('Playoff start date',{exact:false}).fill('2027-05-01');
  await expect(page.getByRole('button',{name:'Next: Divisions'})).toBeDisabled();
  await page.getByLabel('Playoff start date',{exact:false}).fill('2027-04-20');
  await page.getByLabel('Playoff end date',{exact:false}).fill('2027-04-30');
  await page.getByRole('button',{name:'Next: Divisions'}).click();
  await expect(page.getByLabel('Division name',{exact:false})).toBeVisible();
  fields.division=await visibleFields();assert.ok(fields.division<=10);
  writeFileSync(OUT+'/field-counts.json',JSON.stringify(fields,null,2));
  checks.push('Date questions are guided, survive refresh, and reject incomplete or out-of-season playoff dates.');
  await page.screenshot({path:OUT+'/shots/division-basics.png',fullPage:true});
  await page.getByLabel("Division name", { exact: false }).fill("Adult Open");
  if (true) {
    await page.locator("summary").filter({hasText:/^Game rules/}).click();
    await page.getByLabel("Period length", { exact: false }).fill("17");
    await page.getByLabel("Period length", { exact: false }).press("Tab");
    await page.getByRole("combobox", { name: /^Overtime/ }).selectOption("none");
    await page.locator("summary").filter({hasText:/^Playoff rules/}).click();
    await page.getByLabel("Playoff overtime", { exact: true }).selectOption("sudden_death");
    await page.getByRole("button", { name: "Copy Division 1", exact: true }).click();
    await page.getByLabel("Division name", { exact: false }).fill("Adult 40+");
    await page.locator("summary:visible").filter({hasText:/^Game rules/}).click();
    await page.locator("summary:visible").filter({hasText:/^Playoff rules/}).click();
    await expect(page.getByLabel("Period length", { exact: false })).toHaveValue("17");
    await expect(page.getByLabel("Playoff overtime", { exact: true })).toHaveValue("sudden_death");
    checks.push("Copy Division preserves period length and the independent playoff overtime rule; the copied division gets its own name.");
  }
  await page.getByRole("button", { name: "Next: Registration" }).click();
  await page.getByLabel("Player registration price").fill("185.50");
  await expect(page.getByRole("checkbox", { name: "Charge a separate team registration fee" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Require USA Hockey membership" }).check();
  await page.getByRole("button", { name: "Custom questions (0)" }).click();
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page.getByRole("button", { name: "Short text short_text" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Preferred playing position");
  await page.getByLabel("Label", { exact: true }).press("Tab");
  const questionKey = page.getByRole("textbox", { name: "Key", exact: true });
  await expect(questionKey).toHaveValue("preferred_playing_position");
  await questionKey.fill("preferred_position"); await questionKey.press("Tab");
  await expect(questionKey).toHaveValue("preferred_position");
  await page.getByRole("button", { name: "Close question editor" }).click();
  checks.push("Staff configures the league, dates, division and player price; a separate team fee is off by default.");
  await page.reload();
  await expect(page.getByLabel("Player registration price")).toHaveValue("185.50");
  await expect(page.getByRole("checkbox", { name: "Require USA Hockey membership" })).toBeChecked();
  checks.push("An unfinished registration setup survives refresh without losing its prices or membership choice.");
  await page.getByRole("button", { name: "Next: Review" }).click();
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Review must fit a ${width}px viewport`);
  }
  await page.locator('summary').filter({hasText:/^League and division settings$/}).click();
  await expect(page.getByText('3 × 17 min',{exact:true})).toHaveCount(2);
  await page.screenshot({ path: `${OUT}/shots/guided-setup-review.png`, fullPage: true });
  await expect(page.getByRole("button", { name: "Publish registration" })).toBeDisabled();
  const draftResponse = page.waitForResponse(r => r.url().includes("/registration-setup") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save draft" }).click();
  const draftHttp = await draftResponse;
  assert.equal(draftHttp.status(), 201, await draftHttp.text());
  const draft = await draftHttp.json(); seasonId = draft.seasonId; leagueId = draft.leagueId;
  assert.equal(draft.published, false);
  const closed = await call("GET", `/public/registration/seasons/${seasonId}`);
  assert.equal(closed.status, 200, msgOf(closed));
  assert.notEqual(closed.json.registrationWindow.state, "open"); assert.equal(closed.json.formVersionId, null);
  await expect(page.getByText("Draft saved. Registration is closed until", { exact: false })).toBeVisible();
  checks.push("Saving a draft creates one form and price set while the public registration flow remains closed.");
  await page.reload();
  const confirm = page.getByRole("checkbox", { name: /I reviewed the season/ });
  await expect(confirm).not.toBeChecked(); await confirm.check();
  const publishedResponse = page.waitForResponse(r => r.url().includes("/registration-setup") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Publish registration" }).click();
  const publishHttp = await publishedResponse;
  assert.equal(publishHttp.status(), 201, await publishHttp.text());
  const published = await publishHttp.json();
  assert.equal(published.formId, draft.formId); assert.equal(published.seasonId, seasonId); assert.equal(published.published, true);
  await page.waitForURL(u => u.pathname === `/seasons/${seasonId}`, { timeout: 90000 });
  const open = await call("GET", `/public/registration/seasons/${seasonId}`);
  assert.equal(open.status, 200, msgOf(open)); assert.equal(open.json.registrationWindow.state, "open");
  assert.ok(open.json.formVersionId); assert.equal(open.json.season.config.requireUsaHockeyId, true);
  assert.equal(open.json.formDefinition.questions.find(q => q.key === "preferred_position")?.label, "Preferred playing position");
  const playerTier = open.json.pricingTiers.find(t => t.audience === "player");
  const teamTier = open.json.pricingTiers.find(t => t.audience === "team");
  assert.equal(playerTier.fullPriceCents, 18550); assert.equal(teamTier.fullPriceCents, 0); assert.equal(teamTier.isFree, true);
  const [counts] = await sql`select (select count(*)::int from registration_forms where season_id=${seasonId}) forms,
    (select count(*)::int from pricing_tiers where season_id=${seasonId}) tiers`;
  assert.deepEqual(counts, { forms: 1, tiers: 2 });
  if (true) {
    const divisions = await sql`select rule_set_overrides,playoff_config from divisions where season_id=${seasonId}`;
    assert.equal(divisions.length, 2);
    for (const d of divisions) { assert.equal(d.rule_set_overrides.gameRules.periodLengthMin, 17); assert.equal(d.playoff_config.overtimeRule, "sudden_death"); assert.equal(d.playoff_config.playoffSpots ?? null, null); }
    checks.push("Both saved divisions retain the copied rules and All teams playoff qualification without individual team selection.");
  }
  checks.push("Explicit publication reuses the saved draft, opens the configured public funnel, and preserves a free team tier and staff-reviewed membership requirement.");
  await page.screenshot({ path: `${OUT}/shots/guided-setup-season.png`, fullPage: true });
  console.log(checks.map(c => `PASS ${c}`).join("\n"));
  writeFileSync(`${OUT}/guided-setup-browser.json`, JSON.stringify({ tag, seasonId, leagueId, passed: true, checks, target:process.env.UX_TARGET??"staging" }, null, 2));
  completed = true;
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${OUT}/shots/guided-setup-failure.png`, fullPage: true }).catch(() => {});
    writeFileSync(`${OUT}/guided-setup-failure.txt`, await page.getByRole("main").innerText().catch(() => "Main content unavailable"));
  }
  writeFileSync(`${OUT}/guided-setup-browser.json`, JSON.stringify({ tag, seasonId, leagueId, passed: false, checks, error: String(error) }, null, 2));
  throw error;
} finally {
  clearInterval(diagnostic);await browser.close();
  // Archive only this rehearsal's named fixture; never touch an existing league.
  if (!leagueId) {
    const [fixture] = await sql`select id from leagues where name=${leagueName} and deleted_at is null`;
    leagueId = fixture?.id;
  }
  if (leagueId && admin && !completed) {
    const result = await call("POST", `/league/leagues/${leagueId}/status`, { status: "archived" }, admin);
    assert.ok(result.status < 300, `Archive QA guided fixture: ${result.status} ${msgOf(result)}`);
  }
  await sql.end();
}
