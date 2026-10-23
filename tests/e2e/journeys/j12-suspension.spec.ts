import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { IS_STAGING, signedInAs, stagingSql, watchErrors } from "./_helpers";

/**
 * J12 · Suspension blocks lineup (UC-14).
 *
 * super_admin @ SA  → find a screen to issue / lift a suspension
 *                     (/persons/[id] discipline section, /games, /eligibility)
 * captain @ TA      → /captain/compliance shows the suspension
 * captain @ TA      → /lineups/[gameId] refuses the suspended player
 * super_admin @ SA  → /no-show-report and /eligibility season sweep
 *
 * Read-only on staging except the report run. It never clicks the
 * account-level "Suspend" on /users (that locks the shared staging
 * player out of every app). Product bugs are collected with check()
 * and reported by the last test. Bug ids: doc/testing/bugs/compliance.md.
 */

test.skip(!IS_STAGING, "J12 runs on staging only");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const OUT = resolve(process.env.E2E_OUTPUT_DIR ?? "test-results-compliance", "j12-evidence");
const PLAYER_NAME = "Staging Player";
const TEAM_NAME = "Staging Skaters";
const SEASON_NAME = "Staging 2026-27";

let admin: { context: BrowserContext; page: Page; app: string };
let captain: { context: BrowserContext; page: Page; app: string };
const errs: Record<string, string[]> = {};
const findings: string[] = [];
const blocked: string[] = [];
let playerPersonId = "";
let teamId = "";

function check(ok: boolean, msg: string) {
  if (!ok) findings.push(msg);
}

async function navClick(page: Page, link: RegExp, group?: string) {
  const nav = page.getByRole("navigation").first();
  const target = nav.getByRole("link", { name: link }).first();
  if (!(await target.isVisible().catch(() => false)) && group) {
    await nav.locator("summary", { hasText: group }).first().click({ timeout: 15_000 });
  }
  await target.click({ timeout: 15_000 });
}

async function snap(page: Page, name: string): Promise<string> {
  mkdirSync(OUT, { recursive: true });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  const txt = await page.locator("main").first().innerText({ timeout: 15_000 }).catch(() => "");
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 20_000 }).catch(() => {});
  writeFileSync(`${OUT}/${name}.txt`, `URL ${page.url()}\n\n${txt}`);
  return txt;
}

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(180_000);
  admin = await signedInAs(browser, "superAdmin");
  errs.admin = watchErrors(admin.page);
  captain = await signedInAs(browser, "teamAdmin");
  errs.captain = watchErrors(captain.page);
  const [p] = await stagingSql<{ id: string }>(
    `select p.id from persons p join auth.users u on u.id = p.user_id where u.email = 'staging-player@sportspulse.us'`
  );
  playerPersonId = p?.id ?? "";
  const [t] = await stagingSql<{ id: string }>(`select id from teams where name = $1`, [TEAM_NAME]);
  teamId = t?.id ?? "";
});

test.afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/errors.json`, JSON.stringify(errs, null, 2));
  writeFileSync(`${OUT}/findings.txt`, [...findings, "", "BLOCKED:", ...blocked].join("\n"));
  await Promise.all([admin?.context.close(), captain?.context.close()]);
});

test("1 super_admin looks for an Issue suspension action on the player's person page", async () => {
  const { page, app } = admin;
  await page.goto(app + "/dashboard");
  await navClick(page, /^Persons$/);
  await expect(page).toHaveURL(/\/persons/);
  await page.getByRole("link", { name: new RegExp(PLAYER_NAME) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/persons/${playerPersonId}`));
  const txt = await snap(page, "01-sa-person");
  check(/Suspension history/.test(txt), "person page has no Suspension history section");
  const issue = await page.getByRole("button", { name: /suspen|discipline/i }).count();
  check(
    issue > 0,
    "COMP-10: no screen lets an admin issue a suspension (person page shows history only; SDK gameOps.issueSuspension has no caller)"
  );
  const lift = await page.getByRole("button", { name: /lift|reinstate|serve/i }).count();
  check(lift > 0, "COMP-10: no screen lets an admin lift / serve / reduce a suspension (UC-14 alt flow)");
  writeFileSync(`${OUT}/01-controls.txt`, `issueButtons=${issue} liftButtons=${lift}`);
});

test("2 super_admin: suspension from game events (penalties) path", async () => {
  // UC-14 trigger: finalized scoresheet crosses an infraction threshold.
  const games = await stagingSql<{ id: string; status: string }>(
    `select id, status from games where $1 in (home_team_id, away_team_id)`,
    [teamId]
  );
  writeFileSync(`${OUT}/02-db-games.json`, JSON.stringify(games, null, 2));
  const rules = await stagingSql(
    `select column_name from information_schema.columns
      where table_name in ('divisions','seasons','leagues') and column_name ilike '%suspen%'`
  );
  writeFileSync(`${OUT}/02-db-suspension-rule-columns.json`, JSON.stringify(rules, null, 2));
  check(
    false,
    "COMP-11: no automatic suspension from penalties: no rule config (e.g. 3 misconducts = 1 game) and no code that reads finalized game events to create suspensions"
  );
  if (games.length === 0) {
    blocked.push(`2: no games for ${TEAM_NAME} on staging (needs J10 schedule publish + J11 game finalize)`);
  }
});

test("3 captain /captain/compliance shows suspension status per player", async () => {
  const { page, app } = captain;
  await page.goto(app + "/");
  await navClick(page, /^Compliance$/);
  await expect(page).toHaveURL(/\/captain\/compliance$/);
  const txt = await snap(page, "03-captain-compliance");
  check(
    /suspen/i.test(txt),
    "COMP-12: /captain/compliance has no suspension status at all (reads eligibility records only, never the suspensions table)"
  );
});

test("4 captain lineup refuses a suspended player", async () => {
  const { page, app } = captain;
  await page.goto(app + "/");
  await navClick(page, /^Lineups$/);
  await expect(page).toHaveURL(/\/lineups$/);
  const txt = await snap(page, "04-captain-lineups");
  const games = await stagingSql<{ id: string; status: string }>(
    `select id, status from games where $1 in (home_team_id, away_team_id)
      order by (status = 'scheduled') desc, scheduled_start_ts_utc limit 1`,
    [teamId]
  );
  if (games.length === 0) {
    blocked.push(
      `4: no game for ${TEAM_NAME} on staging, so /lineups/[gameId] cannot be opened. Lineups page says: ${txt.replace(/\s+/g, " ").slice(0, 200)}. Needs J10 (schedule publish).`
    );
    test.info().annotations.push({ type: "blocked", description: "no scheduled game for the staging team" });
    return;
  }
  // A game exists: open its lineup from the list (not by URL) and
  // confirm the player is offered. Because no suspension can be issued
  // from any screen (COMP-10), this records whether the editor would
  // let a player dress without any suspension check.
  const link = page.locator(`a[href="/lineups/${games[0]!.id}"]`).first();
  const listed = await link.isVisible().catch(() => false);
  writeFileSync(`${OUT}/04-game.json`, JSON.stringify({ game: games[0], listedOnLineups: listed }, null, 2));
  if (listed) await link.click();
  else await page.goto(`${app}/lineups/${games[0]!.id}`);
  await expect(page).toHaveURL(new RegExp(`/lineups/${games[0]!.id}`));
  const editor = await snap(page, "04-captain-lineup-editor");
  writeFileSync(`${OUT}/04-editor.txt`, editor);
  const active = await stagingSql(
    `select count(*)::int n from suspensions where person_id = $1 and status = 'active'`,
    [playerPersonId]
  );
  writeFileSync(`${OUT}/04-db-active-suspensions.json`, JSON.stringify(active, null, 2));
  check(
    !/\b[0-9a-f]{8}\b/.test(editor.split("\n").slice(0, 8).join(" ")),
    "COMP-13: lineup editor header shows the opponent as a UUID fragment"
  );
  blocked.push(
    `4: game ${games[0]!.id} status=${games[0]!.status} (listed on /lineups: ${listed}). Lineup refusal cannot be exercised: no UI can create a suspension (COMP-10); code shows PUT /games/:id/lineups/:teamId never reads suspensions (COMP-13)`
  );
});

test("5 super_admin /no-show-report and /eligibility season sweep", async () => {
  const { page, app } = admin;
  await page.goto(app + "/dashboard");
  await navClick(page, /^No-show report$/, "Compliance");
  await expect(page).toHaveURL(/\/no-show-report$/);
  const selects = page.locator("main select");
  await selects.nth(0).selectOption({ label: SEASON_NAME });
  const opts = await selects.nth(1).locator("option").allInnerTexts();
  const other = opts.find((o) => o !== SEASON_NAME && !/pick/.test(o));
  if (other) {
    await selects.nth(1).selectOption({ label: other });
    await page.getByRole("button", { name: /Run report/i }).click();
    await page.waitForTimeout(3000);
  }
  const txt = await snap(page, "05-sa-no-show-report");
  check(
    !/error|failed|forbidden/i.test(txt),
    `no-show report run shows an error: ${txt.replace(/\s+/g, " ").slice(0, 300)}`
  );

  // The same season on both sides should be refused, not silently run.
  await selects.nth(1).selectOption({ label: SEASON_NAME });
  const runEnabled = await page.getByRole("button", { name: /Run report/i }).isEnabled();
  writeFileSync(`${OUT}/05-same-season.txt`, `runEnabledWithSameSeason=${runEnabled}`);

  await page.goto(app + "/eligibility");
  await page.locator("main select").first().selectOption({ label: SEASON_NAME });
  await page.getByRole("button", { name: /Run eligibility sweep/i }).click();
  await expect(page.getByText(/Eligibility sweep complete/)).toBeVisible({ timeout: 30_000 });
  const sweep = await snap(page, "05-sa-eligibility-sweep");
  const rec = await stagingSql(
    `select er.status, er.rule_evaluation from eligibility_records er join seasons s on s.id = er.season_id
      where er.person_id = $1 and s.name = $2`,
    [playerPersonId, SEASON_NAME]
  );
  writeFileSync(`${OUT}/05-db-eligibility.json`, JSON.stringify(rec, null, 2));
  writeFileSync(`${OUT}/05-sweep.txt`, sweep);
  check(
    JSON.stringify(rec).includes("suspension"),
    "COMP-14: eligibility season sweep never evaluates suspensions (rule_evaluation has no suspension check)"
  );
});

test("6 report findings", async () => {
  test.info().annotations.push({ type: "blocked", description: blocked.join(" | ") || "none" });
  expect(findings, findings.join("\n")).toEqual([]);
});
