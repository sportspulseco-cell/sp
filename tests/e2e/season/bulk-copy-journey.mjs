import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { CFG, OUT, TARGET, SUPABASE_IP, call, login, sql } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Bulk copy browser rehearsal is staging-only");
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const tag = randomUUID().slice(0, 8), destination = `QA Bulk Next ${tag}`, sources = [], copied = [], checks = [];
const token = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
try {
  for (const letter of ["A", "B"]) {
    const result = await call("POST", `/registration-v2/seasons/${ids.seasonId}/duplicate`, {
      name: `QA Bulk Source ${tag} ${letter}`, newLeagueName: `QA Bulk Hockey ${tag} ${letter}`,
      startDate: "2027-06-01", requestId: randomUUID(),
    }, token);
    assert.ok(result.status < 300, JSON.stringify(result.json)); sources.push(result.json);
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const signIn = new URL("/sign-in", CFG.apps.org);
  signIn.searchParams.set("x-vercel-protection-bypass", CFG.bypass("org")); signIn.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(signIn.toString()); await page.locator("input[type=email]").fill(CFG.orgAdmin.email);
  await page.locator("input[type=password]").fill(CFG.orgAdmin.password); await page.locator("button[type=submit]").click();
  await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
  await page.goto(`${CFG.apps.org}/seasons`);
  await page.getByRole("button", { name: "Roll forward leagues" }).click();
  const dialog = page.getByRole("dialog");
  const newPlan = dialog.getByRole("button", { name: "New plan", exact: true });
  if (await newPlan.isVisible()) await newPlan.click();
  await dialog.getByLabel("New season name").fill(destination);
  await dialog.getByLabel("New season starts").fill("2027-09-01");
  for (const letter of ["A", "B"]) await dialog.getByRole("checkbox", { name: new RegExp(`QA Bulk Hockey ${tag} ${letter}`) }).check();
  await dialog.getByRole("button", { name: "Create 2 draft copies" }).click();
  // Pause immediately while the first actual server operation is in flight.
  await dialog.getByRole("button", { name: "Pause after current copy" }).click();
  await expect(dialog.getByRole("status")).toHaveText(`1 of 2 copied for ${destination}.`);
  await expect(dialog.getByRole("button", { name: "Continue / retry unfinished" })).toBeVisible();
  checks.push("Two leagues selected; pause completes the in-flight copy and leaves the second unfinished.");
  await page.reload(); await page.getByRole("button", { name: "Roll forward leagues" }).click();
  await expect(dialog.getByRole("status")).toHaveText(`1 of 2 copied for ${destination}.`);
  await dialog.getByRole("button", { name: "Continue / retry unfinished" }).click();
  await expect(dialog.getByRole("status")).toHaveText(`2 of 2 copied for ${destination}.`);
  await expect(dialog.getByRole("button", { name: "All copies ready" })).toBeDisabled();
  checks.push("Reload restores the saved plan; resume skips the completed copy and finishes the second without duplication.");
  const rows = await sql`select s.id,s.league_id,s.status,
    (select count(*)::int from registration_forms f where f.season_id=s.id and f.active_version_id is not null) live_forms,
    (select count(*)::int from registrations r where r.season_id=s.id) registrations,
    (select count(*)::int from team_memberships m where m.season_id=s.id) memberships,
    (select count(*)::int from games g where g.season_id=s.id) games
    from seasons s where s.name=${destination} and s.league_id in ${sql(sources.map(item => item.leagueId))}`;
  assert.equal(rows.length, 2); assert.equal(new Set(rows.map(row => row.league_id)).size, 2);
  for (const row of rows) {
    copied.push(row.id); assert.equal(row.status, "draft");
    for (const key of ["live_forms", "registrations", "memberships", "games"]) assert.equal(row[key], 0);
  }
  checks.push("Both copies stay draft with unpublished registration forms, no registrations, roster memberships or games.");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/bulk-copy-resumed.png`, fullPage: true });
  writeFileSync(`${OUT}/bulk-copy-browser.json`, JSON.stringify({ tag, passed: checks.length, checks, outcome: "passed" }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }));
} catch (error) {
  writeFileSync(`${OUT}/bulk-copy-browser.json`, JSON.stringify({ tag, checks, outcome: "failed", error: String(error) }, null, 2)); throw error;
} finally {
  await browser.close();
  if (sources.length) {
    const qaLeagues = sources.map(item => item.leagueId);
    const seasons = await sql`select id from seasons where league_id in ${sql(qaLeagues)}`;
    for (const season of seasons) {
      const result = await call("POST", `/league/seasons/${season.id}/status`, { status: "archived" }, token);
      assert.ok(result.status < 300, `Could not archive QA season: ${result.status}`);
    }
    for (const leagueId of qaLeagues) {
      const result = await call("POST", `/league/leagues/${leagueId}/status`, { status: "archived" }, token);
      assert.ok(result.status < 300, `Could not archive QA league: ${result.status}`);
    }
  }
  await sql.end({ timeout: 5 });
}
