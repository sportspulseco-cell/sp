import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { IS_STAGING, RUN_TAG, openNav, signedInAs, stagingSql, watchErrors } from "./_helpers";

/**
 * J12 · Suspension blocks lineup (UC-14).
 *
 * super_admin @ SA  → /persons/[id] Suspensions → Issue suspension (1 game)
 * captain @ TA      → /captain/compliance lists the suspended player
 * captain @ TA      → /lineups/[gameId] marks the player Scratch-only
 * super_admin @ SA  → /no-show-report and /eligibility season sweep
 * super_admin @ SA  → Lift the suspension (cleanup, also the lift flow)
 *
 * MUTATES staging: one 1-game suspension on Staging Player (reason carries
 * RUN_TAG), lifted by the last step. It never clicks the account-level
 * "Suspend account" on /users (that locks the shared staging player out of
 * every app). Step 2 checks COMP-11's league discipline rules and the
 * penalty Ejection choice without saving or finalizing anything. Bug ids:
 * doc/testing/bugs/compliance.md.
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
const REASON = `${RUN_TAG} J12 game misconduct`;

function check(ok: boolean, msg: string) {
  if (!ok) findings.push(msg);
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

test("1 super_admin issues a 1-game suspension from the player's person page", async () => {
  const { page, app } = admin;
  await page.goto(app + "/dashboard");
  await openNav(page, /^People$/);
  await expect(page).toHaveURL(/\/persons/);
  await page.getByRole("link", { name: new RegExp(PLAYER_NAME) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/persons/${playerPersonId}`));
  const txt = await snap(page, "01-sa-person");
  expect(txt, "person page has a Suspensions section").toMatch(/Suspensions/);

  // COMP-10: the action exists and the dialog offers the three lengths.
  await page.getByRole("button", { name: /Issue suspension/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.locator("select option").allInnerTexts()).toEqual([
    "Number of games",
    "Until a date",
    "Until lifted"
  ]);
  await expect(dialog.locator("input[type=number]")).toHaveValue("1");
  await dialog.locator("textarea").fill(REASON);
  await dialog.getByRole("button", { name: "Suspend player" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // Same surface, no reload: the new row is there.
  const row = page.locator("tbody tr").filter({ hasText: REASON });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toContainText(/1 of 1 game left/);
  await expect(row.getByRole("button", { name: "Lift" })).toBeVisible();
  await snap(page, "01-sa-person-after-issue");

  const rows = await stagingSql<{ status: string; kind: string; n_games: number; served_count: number }>(
    `select status, kind, n_games, served_count from suspensions where person_id = $1 and reason = $2`,
    [playerPersonId, REASON]
  );
  writeFileSync(`${OUT}/01-db-suspension.json`, JSON.stringify(rows, null, 2));
  expect(rows).toEqual([{ status: "active", kind: "n_games", n_games: 1, served_count: 0 }]);
});

/** A UI check that must not stop the walk: step 6 lifts step 1's suspension. */
async function checkUi(msg: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    findings.push(`${msg}: ${String((e as Error).message).split("\n")[0]}`);
  }
}

test("2 super_admin: suspension from game events (penalties) path", async () => {
  // UC-14 trigger: a finalized scoresheet crosses an infraction threshold.
  // COMP-11 (26 Oct): the rules live on the league (Edit league >
  // Discipline, leagues.metadata.discipline), a penalty records its
  // ejection, and finalizing the game issues the suspension. J12 checks the
  // rules the admin sees against the database and the Ejection choice on a
  // penalty, and cancels both dialogs. It does not finalize a game: that
  // changes shared staging games and would serve step 1's suspension.
  const { page, app } = admin;
  const games = await stagingSql<{ id: string; status: string }>(
    `select id, status from games where $1 in (home_team_id, away_team_id)`,
    [teamId]
  );
  writeFileSync(`${OUT}/02-db-games.json`, JSON.stringify(games, null, 2));
  const leagueSql = `select l.id, l.name, l.metadata->'discipline' discipline
       from leagues l join seasons s on s.league_id = l.id where s.name = $1`;
  const [league] = await stagingSql<{ id: string; name: string; discipline: Record<string, unknown> | null }>(
    leagueSql,
    [SEASON_NAME]
  );
  writeFileSync(`${OUT}/02-db-league-discipline.json`, JSON.stringify(league ?? null, null, 2));
  expect(league, `the league of ${SEASON_NAME} exists`).toBeTruthy();
  const enabled = league!.discipline?.enabled === true;

  await page.goto(app + "/dashboard");
  await openNav(page, /^Leagues$/);
  await expect(page).toHaveURL(/\/leagues$/);
  await page.locator(`main a[href="/leagues/${league!.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/leagues/${league!.id}`));
  const dialog = page.getByRole("dialog");
  await checkUi("COMP-11: Edit league has no Discipline section matching the saved rules", async () => {
    await page.getByRole("button", { name: "Edit league" }).click();
    await expect(dialog.locator("legend", { hasText: "Discipline" })).toBeVisible();
    const auto = dialog.getByRole("checkbox", { name: "Suspend players automatically when a game is finalized" });
    // Off until a league admin turns it on; the dialog shows what is saved.
    if (enabled) {
      await expect(auto).toBeChecked();
      const saved = league!.discipline!.gameMisconductGames;
      if (typeof saved === "number") {
        await expect(dialog.getByLabel("Games for a game misconduct")).toHaveValue(String(saved));
      }
    } else {
      await expect(auto).not.toBeChecked();
      await expect(dialog.getByText("Admins can still suspend a player from a penalty on the game page.")).toBeVisible();
      // Turning it on offers the rule fields (not saved: the dialog is cancelled).
      await auto.check();
      await expect(dialog.getByLabel("Games for a game misconduct")).toBeVisible();
    }
    await snap(page, "02-sa-edit-league-discipline");
  });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  }
  // Cancel saved nothing.
  const [after] = await stagingSql<{ discipline: unknown }>(leagueSql, [SEASON_NAME]);
  expect(after?.discipline ?? null, "Cancel on Edit league leaves the saved rules unchanged").toEqual(
    league!.discipline ?? null
  );

  // A penalty records its ejection; the dialog offers the kernel's choices.
  const live = games.find((g) => g.status === "in_play");
  if (!live) {
    blocked.push(`2: no in-play game for ${TEAM_NAME} on staging, so the penalty Ejection choice was not opened`);
  } else {
    await page.goto(`${app}/games/${live.id}`);
    await checkUi("COMP-11: a penalty on the game page has no Ejection choice", async () => {
      await page.getByRole("button", { name: /Log event/ }).click();
      await expect(dialog).toBeVisible();
      await dialog.locator("#eventType").selectOption("penalty");
      expect(await dialog.locator("#ejection option").allInnerTexts()).toEqual([
        "None",
        "Game misconduct",
        "Match penalty"
      ]);
      await snap(page, "02-sa-penalty-ejection");
    });
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    }
  }
  // Evidence only: automatic suspensions already on staging (finalize path).
  const auto = await stagingSql(
    `select id, status, n_games, served_count, reason, source_event_id from suspensions
      where reason like 'Automatic:%' order by created_at desc limit 5`
  ).catch((e) => [{ error: String(e) }]);
  writeFileSync(`${OUT}/02-db-automatic-suspensions.json`, JSON.stringify(auto, null, 2));
});

test("3 captain /captain/compliance lists the suspended player", async () => {
  const { page, app } = captain;
  await page.goto(app + "/");
  await openNav(page, /^Waivers & documents$/);
  await expect(page).toHaveURL(/\/captain\/compliance$/);
  const txt = await snap(page, "03-captain-compliance");
  expect(txt).toMatch(/suspended players/i);
  const item = page.locator("li").filter({ hasText: PLAYER_NAME }).filter({ hasText: /Suspended ·/i });
  await expect(item.first()).toContainText(/1 of 1 game left/i);
});

test("4 captain lineup marks the suspended player Scratch-only", async () => {
  const { page, app } = captain;
  await page.goto(app + "/");
  await openNav(page, /^Game lineups$/);
  await expect(page).toHaveURL(/\/lineups$/);
  const txt = await snap(page, "04-captain-lineups");
  // The team's next published, not-yet-started game is the one a
  // 1-game suspension covers.
  const games = await stagingSql<{ id: string; status: string }>(
    `select id, status from games where $1 in (home_team_id, away_team_id)
      and status = 'scheduled' and published_at is not null
      order by scheduled_start_ts_utc limit 1`,
    [teamId]
  );
  if (games.length === 0) {
    blocked.push(
      `4: no published scheduled game for ${TEAM_NAME} on staging, so the lineup refusal cannot be opened. Lineups page says: ${txt.replace(/\s+/g, " ").slice(0, 200)}. Needs J10 (schedule publish).`
    );
    test.info().annotations.push({ type: "blocked", description: "no published scheduled game for the staging team" });
    return;
  }
  const gameId = games[0]!.id;
  const link = page.locator(`a[href="/lineups/${gameId}"]`).first();
  if (await link.isVisible().catch(() => false)) await link.click();
  else await page.goto(`${app}/lineups/${gameId}`);
  await expect(page).toHaveURL(new RegExp(`/lineups/${gameId}`));
  const editor = await snap(page, "04-captain-lineup-editor");
  writeFileSync(`${OUT}/04-editor.txt`, editor);
  check(
    !/\b[0-9a-f]{8}\b/.test(editor.split("\n").slice(0, 8).join(" ")),
    "COMP-13: lineup editor header shows the opponent as a UUID fragment"
  );
  // COMP-13: the editor names the player and allows Scratch only.
  await expect(page.getByText(new RegExp(`Suspended for this game: ${PLAYER_NAME}`))).toBeVisible();
  await expect(page.getByRole("radio", { name: `${PLAYER_NAME} · starters` })).toBeDisabled();
  await expect(page.getByRole("radio", { name: `${PLAYER_NAME} · bench` })).toBeDisabled();
  await expect(page.getByRole("radio", { name: `${PLAYER_NAME} · scratches` })).toBeChecked();
  await page.getByRole("button", { name: /Save lineup/ }).click();
  await expect(page.getByText("Saved.")).toBeVisible({ timeout: 30_000 });
  const [lineup] = await stagingSql<{ lineup: { scratches?: Array<{ personId: string }>; starters?: Array<{ personId: string }>; bench?: Array<{ personId: string }> } }>(
    `select lineup from game_lineups where game_id = $1 and team_id = $2`,
    [gameId, teamId]
  );
  writeFileSync(`${OUT}/04-db-lineup.json`, JSON.stringify(lineup, null, 2));
  const dressed = [...(lineup?.lineup.starters ?? []), ...(lineup?.lineup.bench ?? [])].map((p) => p.personId);
  expect(dressed).not.toContain(playerPersonId);
  expect((lineup?.lineup.scratches ?? []).map((p) => p.personId)).toContain(playerPersonId);
});

test("5 super_admin /no-show-report and /eligibility season sweep", async () => {
  const { page, app } = admin;
  await page.goto(app + "/dashboard");
  await openNav(page, /^Teams that did not return$/);
  await expect(page).toHaveURL(/\/no-show-report$/);
  const selects = page.locator("main select");
  await selects.nth(0).selectOption({ label: SEASON_NAME });
  const opts = await selects.nth(1).locator("option").allInnerTexts();
  const other = opts.find((o) => o !== SEASON_NAME && !/pick/i.test(o));
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
  await page
    .locator("main select")
    .filter({ has: page.locator("option", { hasText: SEASON_NAME }) })
    .first()
    .selectOption({ label: SEASON_NAME });
  await page.getByRole("button", { name: /Run eligibility sweep/i }).click();
  await expect(page.getByText(/Eligibility sweep complete/)).toBeVisible({ timeout: 30_000 });
  const sweep = await snap(page, "05-sa-eligibility-sweep");
  const rec = await stagingSql<{
    status: string;
    rule_evaluation: { suspension?: { status: string }; lastSweep?: { evaluatedStatus: string; keptWaiver: boolean } };
  }>(
    `select er.status, er.rule_evaluation from eligibility_records er join seasons s on s.id = er.season_id
      where er.person_id = $1 and s.name = $2`,
    [playerPersonId, SEASON_NAME]
  );
  writeFileSync(`${OUT}/05-db-eligibility.json`, JSON.stringify(rec, null, 2));
  writeFileSync(`${OUT}/05-sweep.txt`, sweep);
  // COMP-14: the sweep evaluates the standing suspension. COMP-17: a
  // waived record stays waived, with the fresh evaluation recorded.
  expect(rec[0]?.rule_evaluation.suspension?.status).toBe("suspended");
  expect(rec[0]?.rule_evaluation.lastSweep?.evaluatedStatus).toBe("ineligible");
  expect(rec[0]?.status).toBe(rec[0]?.rule_evaluation.lastSweep?.keptWaiver ? "waived" : "ineligible");
});

test("6 super_admin lifts the suspension with a reason (also cleans up)", async () => {
  const { page, app } = admin;
  await page.goto(`${app}/persons/${playerPersonId}`);
  const row = page.locator("tbody tr").filter({ hasText: REASON });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByRole("button", { name: "Lift" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Lift suspension" })).toBeDisabled();
  await dialog.locator("textarea").fill(`${RUN_TAG} J12 cleanup`);
  await dialog.getByRole("button", { name: "Lift suspension" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(row.getByText("lifted", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(row.getByRole("button", { name: "Lift" })).toHaveCount(0);
  await snap(page, "06-sa-person-after-lift");
  const rows = await stagingSql<{ status: string }>(
    `select status from suspensions where person_id = $1 and reason like $2`,
    [playerPersonId, `${REASON}%`]
  );
  expect(rows).toEqual([{ status: "lifted" }]);
});

test("7 report findings", async () => {
  test.info().annotations.push({ type: "blocked", description: blocked.join(" | ") || "none" });
  expect(findings, findings.join("\n")).toEqual([]);
});
