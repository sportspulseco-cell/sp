import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { CFG, OUT, TARGET, SUPABASE_IP, call, login, sql, msgOf } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Guided setup rehearsal is staging-only");
const checks = [], tag = randomUUID().slice(0, 8);
const leagueName = `QA Guided Hockey ${tag}`, seasonName = `QA Guided Season ${tag}`;
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
let leagueId, seasonId, admin;
try {
  admin = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const url = new URL("/sign-in", CFG.apps.org);
  url.searchParams.set("x-vercel-protection-bypass", CFG.bypass("org")); url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.toString());
  await page.locator("input[type=email]").fill(CFG.orgAdmin.email);
  await page.locator("input[type=password]").fill(CFG.orgAdmin.password);
  await page.locator("button[type=submit]").click(); await page.waitForURL(u => !u.pathname.startsWith("/sign-in"));
  await page.goto(`${CFG.apps.org}/org-setup`);
  await page.getByRole("button", { name: /PPHL Staging/ }).click();
  await page.getByRole("button", { name: "Next: League" }).click();
  await page.getByLabel("League name", { exact: false }).fill(leagueName);
  await page.getByLabel("Sport", { exact: false }).selectOption("HOCKEY_ICE");
  await page.getByRole("button", { name: "Next: Season" }).click();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  await page.getByLabel("Season name", { exact: false }).fill(seasonName);
  await page.getByLabel("Registration opens", { exact: false }).fill(today);
  await page.getByLabel("Registration closes", { exact: false }).fill("2027-01-01");
  await page.getByLabel("Season start date", { exact: false }).fill("2027-01-02");
  await page.getByLabel("Season end date", { exact: false }).fill("2027-04-30");
  await page.getByRole("button", { name: "Next: Divisions" }).click();
  await page.getByLabel("Division name", { exact: false }).fill("Adult Open");
  await page.getByRole("button", { name: "Next: Registration" }).click();
  await page.getByLabel("Player registration price").fill("185.50");
  await expect(page.getByRole("checkbox", { name: "Charge a separate team registration fee" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Require USA Hockey membership" }).check();
  checks.push("Staff configures the league, dates, division and player price; a separate team fee is off by default.");
  await page.reload();
  await expect(page.getByLabel("Player registration price")).toHaveValue("185.50");
  await expect(page.getByRole("checkbox", { name: "Require USA Hockey membership" })).toBeChecked();
  checks.push("An unfinished registration setup survives refresh without losing its prices or membership choice.");
  await page.getByRole("button", { name: "Next: Review" }).click();
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
  const playerTier = open.json.pricingTiers.find(t => t.audience === "player");
  const teamTier = open.json.pricingTiers.find(t => t.audience === "team");
  assert.equal(playerTier.fullPriceCents, 18550); assert.equal(teamTier.fullPriceCents, 0); assert.equal(teamTier.isFree, true);
  const [counts] = await sql`select (select count(*)::int from registration_forms where season_id=${seasonId}) forms,
    (select count(*)::int from pricing_tiers where season_id=${seasonId}) tiers`;
  assert.deepEqual(counts, { forms: 1, tiers: 2 });
  checks.push("Explicit publication reuses the saved draft, opens the configured public funnel, and preserves a free team tier and staff-reviewed membership requirement.");
  await page.screenshot({ path: `${OUT}/shots/guided-setup-season.png`, fullPage: true });
  console.log(checks.map(c => `PASS ${c}`).join("\n"));
  writeFileSync(`${OUT}/guided-setup-browser.json`, JSON.stringify({ tag, seasonId, leagueId, passed: true, checks }, null, 2));
} catch (error) {
  writeFileSync(`${OUT}/guided-setup-browser.json`, JSON.stringify({ tag, seasonId, leagueId, passed: false, checks, error: String(error) }, null, 2));
  throw error;
} finally {
  await browser.close();
  // Archive only this rehearsal's named fixture; never touch an existing league.
  if (!leagueId) {
    const [fixture] = await sql`select id from leagues where name=${leagueName} and deleted_at is null`;
    leagueId = fixture?.id;
  }
  if (leagueId && admin) {
    const result = await call("POST", `/league/leagues/${leagueId}/status`, { status: "archived" }, admin);
    assert.ok(result.status < 300, `Archive QA guided fixture: ${result.status} ${msgOf(result)}`);
  }
  await sql.end();
}
