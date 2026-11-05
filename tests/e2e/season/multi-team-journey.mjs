import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { CFG, OUT, TARGET, SUPABASE_IP, call, login, sql } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Multi-team rehearsal is staging-only");
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const player = ids.players["Team Alpha"].find(p => p.rostered);
const primary = ids.teams["Team Alpha"].id, secondary = ids.teams["Team Echo"].id;
const checks = []; let added = false, admin;
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`] });
try {
  admin = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  const add = await call("POST", "/roster/moves/add", { teamId: secondary, personId: player.personId,
    seasonId: ids.seasonId, jerseyNumber: 77, membershipType: "primary", reason: "QA offline multi-team rehearsal", sourceEventId: `qa-multi-team-${randomUUID()}` }, admin);
  assert.equal(add.status, 201); added = true;
  checks.push("Scoped organization staff adds an existing player to a second team without charging a team fee.");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  const url = new URL("/sign-in", CFG.apps.player);
  url.searchParams.set("x-vercel-protection-bypass", CFG.bypass("player")); url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  await page.goto(url.toString());
  await page.locator("input[type=email]").fill(player.email);
  await page.locator("input[type=password]").fill(`Play!${ids.tag}x9`);
  await page.locator("button[type=submit]").click(); await page.waitForURL(u => !u.pathname.startsWith("/sign-in"));
  await page.goto(`${CFG.apps.player}/team`);
  const picker = page.getByRole("combobox", { name: "Team", exact: true });
  async function switchTo(teamId) {
    await picker.selectOption(teamId);
    await expect.poll(async () => (await context.cookies()).find(c => c.name === "sp_active_team")?.value,
      { timeout: 30000 }).toBe(teamId);
    await expect(picker).toBeEnabled({ timeout: 30000 });
  }
  await expect(picker).toBeVisible();
  await switchTo(secondary);
  await expect(picker).toHaveValue(secondary);
  await expect(page.getByRole("main").getByText(/Team Echo/).first()).toBeVisible();
  await expect(page.getByRole("main").getByText(player.name, { exact: true }).first()).toBeVisible();
  checks.push("Player switches to the second team's roster and sees their own membership.");
  await page.goto(`${CFG.apps.player}/schedule`);
  await expect(picker).toHaveValue(secondary);
  await expect(page.getByRole("main").getByText(/Team Foxtrot|Team Golf|Team Hotel/).first()).toBeVisible();
  await page.goto(`${CFG.apps.player}/stats`); await expect(picker).toHaveValue(secondary);
  await page.reload(); await expect(picker).toHaveValue(secondary);
  checks.push("Second-team context persists through schedule, stats and reload.");
  await switchTo(primary);
  await page.goto(`${CFG.apps.player}/team`); await expect(picker).toHaveValue(primary);
  await expect(page.getByRole("main").getByText(/Team Alpha/).first()).toBeVisible();
  await context.addCookies([{ name: "sp_active_team", value: ids.teams["Team Lima"].id,
    domain: new URL(CFG.apps.player).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
  await page.reload();
  assert.ok([primary, secondary].includes(await picker.inputValue()));
  checks.push("A forged cookie for an unassigned team falls back to an authorized team.");
  console.log(checks.map(c => `PASS ${c}`).join("\n"));
  writeFileSync(`${OUT}/multi-team-browser.json`, JSON.stringify({ tag: ids.tag, passed: true, checks }, null, 2));
} finally {
  await browser.close();
  if (added) {
    const dropped = await call("POST", "/roster/moves/drop", { teamId: secondary, personId: player.personId,
      seasonId: ids.seasonId, reason: "QA multi-team context rehearsal completed", sourceEventId: `qa-multi-team-drop-${randomUUID()}` }, admin);
    assert.equal(dropped.status, 201, "Close the temporary second-team membership");
  }
  await sql.end();
}
