import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql, watchErrors } from "./_helpers";

/**
 * J9 · Eligibility and documents (UC-05, UC-27, UC-29).
 *
 * player @ PL /compliance  → sees requirements, submits USA Hockey ID
 * super_admin @ SA /documents → review queue? + creates/publishes a waiver template
 * super_admin @ SA /eligibility → season sweep, then a decision (waive)
 * captain @ TA /captain/compliance → reflects the decision for the player
 * player @ PL /compliance + /notifications → sees the decision
 * league_admin @ SA /eligibility → UC actor can reach the queue
 *
 * The walk is serial (one sign-in per role). Product bugs are collected
 * with `check()` and reported together by the last test, so one bug does
 * not hide the rest. Hard `expect` is only used where the next step
 * cannot run without it. Bug ids: doc/testing/bugs/compliance.md.
 */

test.skip(!IS_STAGING, "J9 mutates data: staging only");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const OUT = resolve(process.env.E2E_OUTPUT_DIR ?? "test-results-compliance", "j09-evidence");
const PLAYER_NAME = "Staging Player";
const SEASON_NAME = "Staging 2026-27";

let player: { context: BrowserContext; page: Page; app: string };
let admin: { context: BrowserContext; page: Page; app: string };
let captain: { context: BrowserContext; page: Page; app: string };
const errs: Record<string, string[]> = {};
const findings: string[] = [];
let playerPersonId = "";
let seasonId = "";

function check(ok: boolean, msg: string) {
  if (!ok) findings.push(msg);
}

/** Click a sidebar link, opening its collapsed group first if needed. */
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
  player = await signedInAs(browser, "player");
  errs.player = watchErrors(player.page);
  admin = await signedInAs(browser, "superAdmin");
  errs.admin = watchErrors(admin.page);
  captain = await signedInAs(browser, "teamAdmin");
  errs.captain = watchErrors(captain.page);
  const [p] = await stagingSql<{ id: string }>(
    `select p.id from persons p join auth.users u on u.id = p.user_id where u.email = 'staging-player@sportspulse.us'`
  );
  playerPersonId = p?.id ?? "";
  const [s] = await stagingSql<{ id: string }>(`select id from seasons where name = $1`, [SEASON_NAME]);
  seasonId = s?.id ?? "";
});

test.afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/errors.json`, JSON.stringify(errs, null, 2));
  writeFileSync(`${OUT}/findings.txt`, findings.join("\n"));
  await Promise.all([player?.context.close(), admin?.context.close(), captain?.context.close()]);
});

test("1 player finds /compliance from the sidebar", async () => {
  const { page, app } = player;
  await page.goto(app + "/");
  await page.getByRole("link", { name: /^Waivers & documents$/ }).first().click();
  await expect(page).toHaveURL(/\/compliance$/);
  await expect(page.getByRole("heading", { name: "Waivers & documents" })).toBeVisible();
  const txt = await snap(page, "01-player-compliance-before");

  // UC-29 precondition: player uploads ID / eligibility proof.
  const fileInputs = await page.locator("input[type=file]").count();
  check(fileInputs > 0, "COMP-3: /compliance has no file upload for an ID or eligibility document");

  // UC-27 / COMP-4: the player's registration documents are listed, each
  // signed or with a Sign action (staging-player has a registration).
  await expect(page.getByRole("heading", { name: "Registration waivers" })).toBeVisible();
  await expect(page.getByText(/Liability waiver/).first()).toBeVisible();
  const signButtons = await page.getByRole("button", { name: /^Sign$/ }).count();
  const allSigned = await page.getByText(/All signed/i).count();
  expect(signButtons > 0 || allSigned > 0, "COMP-4: each waiver is signed or has a Sign action").toBe(true);
  writeFileSync(`${OUT}/01-controls.txt`, `fileInputs=${fileInputs} signButtons=${signButtons}\n\n${txt}`);
});

test("2 player submits a USA Hockey ID (validation + happy path)", async () => {
  const { page } = player;
  await page.getByRole("button", { name: /Update USA Hockey ID/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Submit your USA Hockey ID")).toBeVisible();

  await dialog.locator("#usa-hockey-id").fill("ab");
  await dialog.getByRole("button", { name: /^Submit$/ }).click();
  await page.waitForTimeout(500);
  const shortText = await dialog.innerText();
  writeFileSync(`${OUT}/02-dialog-short.txt`, shortText);

  await dialog.locator("#usa-hockey-id").fill("ABC1234567");
  await dialog.getByRole("button", { name: /^Submit$/ }).click();
  await page.waitForTimeout(3000);
  const dlgText = (await dialog.isVisible().catch(() => false))
    ? await dialog.innerText()
    : "(dialog closed)";
  await page.screenshot({ path: `${OUT}/02-player-usah-submit.png`, fullPage: true });
  writeFileSync(`${OUT}/02-dialog-submit.txt`, dlgText);
  check(
    /Submitted|dialog closed/.test(dlgText),
    `COMP-2: USA Hockey ID submit failed. Dialog says: ${dlgText.replace(/\s+/g, " ").slice(0, 300)}`
  );

  const rows = await stagingSql(
    `select external_id, status, source from identity_verifications where person_id = $1`,
    [playerPersonId]
  );
  writeFileSync(`${OUT}/02-db-identity_verifications.json`, JSON.stringify(rows, null, 2));
  check(rows.length > 0, "COMP-2: no identity_verifications row written for the player");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /Cancel/i }).click({ timeout: 5_000 }).catch(() => {});
  }
});

test("3 super_admin looks for the player's submission in a review queue (UC-29)", async () => {
  const { page, app } = admin;
  await page.goto(app + "/dashboard");
  await navClick(page, /^Documents$/, "Compliance");
  await expect(page).toHaveURL(/\/documents$/);
  const txt = await snap(page, "03-sa-documents");
  check(
    /Staging Player|ABC1234567|pending verification/i.test(txt),
    "COMP-1: /documents has no queue of player-submitted IDs or documents (it is waiver-template management only)"
  );

  await page.goto(app + "/eligibility");
  const elig = await snap(page, "03-sa-eligibility-before");
  const approve = await page.getByRole("button", { name: /Approve|Verify|Reject/ }).count();
  check(approve > 0, "COMP-1: /eligibility has no Approve / Reject / Verify control (only Waive)");
  writeFileSync(`${OUT}/03-eligibility-controls.txt`, `approveButtons=${approve}\n\n${elig}`);
});

test("4 super_admin creates and publishes a waiver template (UC-27 precondition)", async () => {
  const { page, app } = admin;
  await page.goto(app + "/documents");
  await page.getByRole("button", { name: /New document/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#kind").selectOption("waiver");
  const name = `${RUN_TAG} Liability waiver`;
  await dialog.locator("#name").fill(name);
  await dialog.getByRole("button", { name: /Create document/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const appeared = await page
    .getByRole("link", { name })
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  check(appeared, "J9-step4: new document did not appear in /documents without reload");
  if (!appeared) await page.reload();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("NO ACTIVE VERSION")).toBeVisible();
  await page.locator("#contentHtml").fill(`<p>${RUN_TAG} I accept the risks of hockey.</p>`);
  await page.getByRole("button", { name: /Publish version/i }).click();
  const active = await page
    .getByText(/ACTIVE · v1/)
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check(active, "J9-step4: published version not shown as ACTIVE v1 without reload");
  await snap(page, "04-sa-document-published");
  const rows = await stagingSql(
    `select d.name, d.active_version_id, (select count(*) from document_versions v where v.document_id = d.id)::int versions
       from documents d where d.name = $1`,
    [name]
  );
  writeFileSync(`${OUT}/04-db-documents.json`, JSON.stringify(rows, null, 2));
  expect(rows.length).toBe(1);
});

test("5 super_admin runs the season eligibility sweep, then decides on the player", async () => {
  const { page, app } = admin;
  await page.goto(app + "/eligibility");
  await page.locator("select").first().selectOption({ label: SEASON_NAME });
  const tableBefore = await page.locator("main").innerText();
  const prior = await stagingSql<{ status: string }>(
    `select status from eligibility_records where person_id = $1 and season_id = $2`,
    [playerPersonId, seasonId]
  );
  const waivedBeforeSweep = prior[0]?.status === "waived";
  const playerRow = () =>
    page.locator("tbody tr").filter({ has: page.locator(`a[href="/persons/${playerPersonId}"]`) });
  const rowsBefore = await playerRow().count();
  const rowTextBefore = rowsBefore ? await playerRow().first().innerText() : "";
  await page.getByRole("button", { name: /Run eligibility sweep/i }).click();
  await expect(page.getByText(/Eligibility sweep complete/)).toBeVisible({ timeout: 30_000 });
  const flash = await page.getByText(/Eligibility sweep complete/).innerText();
  await page.waitForTimeout(2000);
  const tableAfter = await page.locator("main").innerText();
  await snap(page, "05-sa-eligibility-after-sweep");
  writeFileSync(`${OUT}/05-sweep.txt`, `FLASH ${flash}\n\nBEFORE\n${tableBefore}\n\nAFTER\n${tableAfter}`);
  const rowsAfter = await playerRow().count();
  const rowTextAfter = rowsAfter ? await playerRow().first().innerText() : "";
  writeFileSync(`${OUT}/05-sweep-row.txt`, `BEFORE ${rowTextBefore}
AFTER ${rowTextAfter}`);
  check(
    rowsBefore === 0 ? rowsAfter > 0 : rowTextAfter !== rowTextBefore,
    "COMP-6: records table under the sweep bar does not refresh after the sweep (stale until reload)"
  );

  const recs = await stagingSql<{ status: string; rule_evaluation: unknown }>(
    `select status, rule_evaluation from eligibility_records where person_id = $1 and season_id = $2`,
    [playerPersonId, seasonId]
  );
  writeFileSync(`${OUT}/05-db-eligibility-after-sweep.json`, JSON.stringify(recs, null, 2));
  expect(recs.length, "sweep should write an eligibility record for the rostered player").toBe(1);
  if (waivedBeforeSweep) {
    check(
      recs[0]?.status === "waived",
      `COMP-17: season sweep overwrote an admin waiver: status was 'waived' before the sweep, '${recs[0]?.status}' after`
    );
  }

  await page.reload();
  const row = playerRow().filter({ hasText: SEASON_NAME }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const statusBefore = await row.innerText();
  check(
    !(recs[0]?.status !== "waived" && /verified offline/.test(statusBefore)),
    `COMP-17: row shows status ${recs[0]?.status} together with a stale waiver reason from an earlier decision`
  );
  check(
    statusBefore.includes(PLAYER_NAME),
    `COMP-9: /eligibility shows the person as a UUID fragment, not a name. Row: ${statusBefore.replace(/\s+/g, " ")}`
  );
  const newRecordEnabled = await page.getByRole("button", { name: /New record/ }).isEnabled();
  check(newRecordEnabled, "COMP-9: /eligibility 'New record' button is disabled (person list failed to load)");

  await row.getByRole("button", { name: /^Waive$/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#waive-reason").fill(`${RUN_TAG} ID verified offline`);
  await dialog.getByRole("button", { name: /Waive eligibility/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const sameSurface = await expect
    .poll(async () => playerRow().filter({ hasText: SEASON_NAME }).first().innerText(), { timeout: 10_000 })
    .toMatch(/waived/i)
    .then(() => true)
    .catch(() => false);
  const statusAfter = await playerRow().filter({ hasText: SEASON_NAME }).first().innerText();
  writeFileSync(`${OUT}/05-row.txt`, `BEFORE ${statusBefore}\nAFTER ${statusAfter}`);
  check(sameSurface, "J9-step5: /eligibility row still not 'waived' 10s after Waive (stale until reload)");
  await snap(page, "05-sa-eligibility-after-waive");
  const after = await stagingSql<{ status: string; waiver_reason: string }>(
    `select status, waiver_reason from eligibility_records where person_id = $1 and season_id = $2`,
    [playerPersonId, seasonId]
  );
  writeFileSync(`${OUT}/05-db-eligibility-after-waive.json`, JSON.stringify(after, null, 2));
  expect(after[0]?.status).toBe("waived");
});

test("6 captain sees the player's status on /captain/compliance (cross-app)", async () => {
  const { page, app } = captain;
  await page.goto(app + "/");
  await navClick(page, /^Compliance$/, "Captain");
  await expect(page).toHaveURL(/\/captain\/compliance$/);
  const txt = await snap(page, "06-captain-compliance");
  check(
    !/No compliance records yet/.test(txt),
    "COMP-5: /captain/compliance shows 'No compliance records yet' although the DB has a waived record for a rostered player"
  );
  check(txt.includes(PLAYER_NAME), "COMP-5: /captain/compliance does not show the player by name");
});

test("7 player sees the decision on /compliance and a notification", async () => {
  const { page, app } = player;
  await page.goto(app + "/compliance");
  const txt = await snap(page, "07-player-compliance-after");
  check(
    !/No requirements yet/.test(txt) && /Waived/.test(txt),
    "COMP-5: player /compliance shows 'No requirements yet' although the DB has a waived record for them"
  );
  await page.getByRole("link", { name: /^Notifications$/ }).first().click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByRole("heading", { name: /Notifications/ }).first()).toBeVisible();
  const notes = await snap(page, "07-player-notifications");
  check(/eligib|waiv/i.test(notes), "COMP-7: no notification to the player about the eligibility decision");
});

test("8 league_admin reaches /eligibility (UC-05/UC-29 actor)", async ({ browser }) => {
  const la = await signedInAs(browser, "leagueAdmin");
  const e = watchErrors(la.page);
  await la.page.goto(la.app + "/eligibility");
  const txt = await snap(la.page, "08-league-admin-eligibility");
  writeFileSync(`${OUT}/08-errors.txt`, e.join("\n"));
  check(
    txt.includes(PLAYER_NAME) || txt.includes(playerPersonId.slice(0, 8)),
    "COMP-8: league_admin sees no eligibility records on /eligibility"
  );
  await la.context.close();
});

test("9 report findings", async () => {
  expect(findings, findings.join("\n")).toEqual([]);
});
