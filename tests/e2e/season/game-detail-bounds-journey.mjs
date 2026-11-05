import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { CFG, OUT, TARGET, SUPABASE_IP, sql } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Game detail browser rehearsal is staging-only");
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const canaryId = randomUUID(), name = `Directory${randomUUID().slice(0, 8)}`, checks = [];
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
try {
  const [game] = await sql`select g.id,h.name home,a.name away from games g
    join teams h on h.id=g.home_team_id join teams a on a.id=g.away_team_id
    where g.season_id=${ids.seasonId} and g.status='completed' limit 1`; assert.ok(game);
  await sql`insert into persons(id,legal_first_name,legal_last_name) values(${canaryId},${name},'Canary')`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const base = "https://staging-superadmin.sportspulse.us", url = new URL("/sign-in", base);
  url.searchParams.set("x-vercel-protection-bypass", CFG.bypass("superadmin")); url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.toString()); await page.locator("input[type=email]").fill(CFG.superAdmin.email);
  await page.locator("input[type=password]").fill(CFG.superAdmin.password); await page.locator("button[type=submit]").click();
  await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
  const started = Date.now(), response = await page.goto(`${base}/games/${game.id}`);
  assert.ok(response?.ok()); const html = await response.text();
  assert.equal(html.includes(name), false, "Unrelated directory people must not be serialized into the game page");
  await expect(page.getByText(game.home, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(game.away, { exact: true }).first()).toBeVisible();
  const observedLoadMs = Date.now() - started;
  checks.push("One completed game renders its teams without serializing an unrelated person from the global directory.");
  const officials = page.locator("section").filter({ has: page.getByText("Crew assigned to this game", { exact: true }) });
  await officials.getByRole("button", { name: "Assign", exact: true }).click();
  await officials.getByRole("checkbox", { name: "Find someone else" }).check();
  await officials.getByLabel("Search by name").fill(name);
  let fail = true, searched = 0;
  await page.route("**/api/iam/persons?**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("search") !== name) return route.continue();
    assert.equal(url.searchParams.get("limit"), "50"); searched++;
    if (fail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA search unavailable" }) });
    await route.continue();
  });
  await officials.getByRole("button", { name: "Search", exact: true }).click();
  await expect(officials.getByRole("alert")).toContainText(/unavailable|503/i);
  fail = false;
  await officials.getByRole("button", { name: "Search", exact: true }).click();
  await expect(officials.getByRole("option", { name: `${name} Canary`, exact: true })).toHaveCount(1);
  await officials.getByLabel("Person", { exact: true }).selectOption(canaryId);
  assert.equal(searched, 2);
  checks.push("Explicit person search requests at most 50 people; failure is visible and retry recovers the matching person without assigning anyone.");
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Game detail fits ${width}px`);
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${OUT}/game-detail-bounded.png`, fullPage: true });
  writeFileSync(`${OUT}/game-detail-bounds-browser.json`, JSON.stringify({ checks, passed: checks.length, observedLoadMs, outcome: "passed" }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, observedLoadMs, checks }));
} catch (error) {
  writeFileSync(`${OUT}/game-detail-bounds-browser.json`, JSON.stringify({ checks, outcome: "failed", error: String(error) }, null, 2)); throw error;
} finally { await browser.close(); await sql`delete from persons where id=${canaryId}`; await sql.end({ timeout: 5 }); }
