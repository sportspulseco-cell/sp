import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql, watchErrors, type Role } from "./_helpers";

/**
 * J15 · Announcements and team messages (UC-19, UC-20, UC-21).
 *
 * org_admin @ org-admin-web /communications/compose sends an org announcement
 * → player @ player-web /notifications (own context) receives it and marks it
 * read → super_admin @ superadmin-web /communications sees it in the outbox.
 * captain @ team-admin-web /comms team message (UC-20). Notification settings
 * on player-web. Game-change notifications (UC-21) checked against staging
 * games, if the scheduling journey has created any.
 *
 * Steps are separate tests so one bug does not hide the next. The run tag
 * and each role's signed-in session are cached on disk per runner process
 * (one sign-in per role per run) so worker restarts after a failure do not
 * hit Supabase's auth rate limit. Bugs: doc/testing/bugs/money.md (MON-n).
 */

test.skip(!IS_STAGING, "journeys mutate data: staging only");
test.describe.configure({ timeout: 180_000 });

const OUT = process.env.E2E_OUTPUT_DIR ?? "test-results";
const SHOTS = `${OUT}-shots`;
const STATE = `${OUT}-state`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(STATE, { recursive: true });
const TAG_FILE = `${STATE}/money-tag-${process.ppid}.txt`;
if (!existsSync(TAG_FILE)) writeFileSync(TAG_FILE, process.env.E2E_RUN_TAG ?? RUN_TAG);
const TAG = readFileSync(TAG_FILE, "utf8").trim();

const PLAYER_EMAIL = "staging-player@sportspulse.us";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/j15-${name}.png`, fullPage: true });
}
async function mainText(page: Page) {
  return (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
}
function log(...a: unknown[]) {
  console.log("[J15]", ...a);
}
function inTwoDaysIso() {
  return new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
}

type Session = { context: BrowserContext; page: Page; app: string; errors: string[] };
const sessions: Partial<Record<Role, Session>> = {};
/** One sign-in per role per runner process; later workers reuse the saved session. */
async function as(browser: Browser, role: Role): Promise<Session> {
  const cached = sessions[role];
  if (cached && !cached.page.isClosed()) return cached;
  const file = `${STATE}/money-${process.ppid}-${role}.json`;
  let s: { context: BrowserContext; page: Page; app: string };
  if (existsSync(file)) {
    const { app, state } = JSON.parse(readFileSync(file, "utf8"));
    const context = await browser.newContext({ storageState: state });
    s = { context, page: await context.newPage(), app };
    await s.page.goto(`${app}/`);
  } else {
    s = await signedInAs(browser, role);
    writeFileSync(file, JSON.stringify({ app: s.app, state: await s.context.storageState() }));
  }
  const errors = watchErrors(s.page);
  sessions[role] = { ...s, errors };
  return sessions[role]!;
}
test.afterAll(async () => {
  for (const [role, s] of Object.entries(sessions)) {
    log(`${role} console/API errors:`, JSON.stringify(s?.errors ?? []));
    await s?.context.close();
  }
});

const SUBJECT = `${TAG} J15 league announcement`;
const BODY = `${TAG} QA broadcast body. Roster lock moves to Friday.`;

test("1. org_admin finds Communications → Compose and sees the UC-19 fields", async ({ browser }) => {
  const p = (await as(browser, "orgAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/`);
  await expect(p.getByText("Loading organization workspace")).toHaveCount(0, { timeout: 60_000 });
  // Communications lives under the collapsed "Operations" group.
  if (!(await p.locator("a[href='/communications']:visible").count())) {
    await p.locator("summary:visible", { hasText: "Operations" }).first().click();
  }
  const nav = p.locator("a[href='/communications']:visible").first();
  await expect(nav, "Communications in org-admin nav").toBeVisible();
  await nav.click();
  await p.waitForURL(/\/communications$/);
  await p.waitForLoadState("networkidle").catch(() => {});
  log("OA /communications:", (await mainText(p)).slice(0, 500));
  await p.locator("a[href='/communications/compose']").first().click();
  await p.waitForURL(/\/communications\/compose/);
  await expect(p.getByPlaceholder("Roster lock moves to Friday")).toBeVisible({ timeout: 30_000 });
  const t = await mainText(p);
  log("compose form:", t.slice(0, 900));
  await shot(p, "01-compose");
  // UC-19: recipients by league / division, schedule for later, attachments, multi-channel.
  expect.soft(await p.locator("main select, main [role='combobox']").count(), "compose lets the admin target a league or division (UC-19)").toBeGreaterThan(0);
  expect.soft(/schedule|send later/i.test(t), "compose offers schedule-for-later (UC-19 alt flow)").toBe(true);
  expect.soft(/attach/i.test(t), "compose offers attachments (UC-19)").toBe(true);
  expect.soft(/sms|push/i.test(t), "compose offers SMS / push channels (UC-19)").toBe(true);
});

test("2. org_admin sends an in-app announcement to Players + Captains", async ({ browser }) => {
  const p = (await as(browser, "orgAdmin")).page;
  if (!/compose/.test(p.url())) {
    await p.goto(`${new URL(p.url()).origin}/communications/compose`);
    await expect(p.getByPlaceholder("Roster lock moves to Friday")).toBeVisible({ timeout: 60_000 });
  }
  const players = p.locator("label", { hasText: "Players" }).locator("input");
  if (!(await players.isChecked())) await players.check();
  const caps = p.locator("label", { hasText: "Captains" }).locator("input");
  if (!(await caps.isChecked())) await caps.check();
  await p.getByPlaceholder("Roster lock moves to Friday").fill(SUBJECT);
  await p.locator("main textarea").first().fill(BODY);
  await p.getByRole("button", { name: "In-app" }).click();
  const respP = p.waitForResponse((r) => /broadcast/.test(r.url()) && r.request().method() === "POST");
  await p.getByRole("button", { name: "Send broadcast" }).click();
  const resp = await respP;
  const json = await resp.text();
  log("broadcast →", resp.status(), json.slice(0, 300));
  expect(resp.status()).toBeLessThan(300);
  await p.waitForTimeout(1000);
  const after = await mainText(p);
  log("compose after send:", after.slice(-400));
  await shot(p, "02-sent");
  const rows = await stagingSql<{ recipient_email: string; channel: string; status: string; template_code: string }>(
    `select n.recipient_email, n.channel, n.status, n.template_code, n.subject from notifications n
      where n.subject = $1 or n.body like $2 or n.payload::text like $2`,
    [SUBJECT, `%${TAG} QA broadcast%`]
  );
  log("db notifications:", JSON.stringify(rows));
  expect(rows.some((r) => r.recipient_email === PLAYER_EMAIL) || rows.length > 0, "notification rows were written for the broadcast").toBe(true);
});

test("3. player @ player-web /notifications receives the announcement and mark-read updates in place", async ({ browser }) => {
  const s = await as(browser, "player");
  const p = s.page;
  await p.goto(`${new URL(p.url()).origin}/`);
  const nav = p.locator("a[href='/notifications']:visible").first();
  await expect(nav, "Notifications entry in player nav").toBeVisible();
  log("player nav notifications label (unread badge?):", JSON.stringify(await nav.innerText()));
  await nav.click();
  await p.waitForURL(/\/notifications$/);
  await p.waitForLoadState("networkidle").catch(() => {});
  const t = await mainText(p);
  log("player /notifications:", t.slice(0, 600));
  await shot(p, "03-player-notifications");
  const db = await stagingSql(
    `select n.subject, n.status, n.channel from notifications n join persons pe on pe.id = n.recipient_person_id join profiles pr on pr.id = pe.user_id where pr.email = $1 order by n.created_at desc`,
    [PLAYER_EMAIL]
  );
  log("db: notifications addressed to the player:", db.length, JSON.stringify(db.slice(0, 5)));
  const item = p.getByText(SUBJECT).first();
  await expect.soft(item, `announcement visible to the player (db has ${db.length} rows for them)`).toBeVisible({ timeout: 10_000 });
  if (await item.isVisible().catch(() => false)) {
    const before = (await mainText(p)).match(/(\d+) unread/)?.[1];
    await item.click();
    await p.waitForTimeout(1500);
    const afterTxt = await mainText(p);
    const after = afterTxt.match(/(\d+) unread/)?.[1] ?? (/All read/.test(afterTxt) ? "0" : "?");
    log("unread before/after mark-read:", before, after);
    expect.soft(Number(after), "unread counter drops in place").toBeLessThan(Number(before));
  }
});

test("4. player notification settings toggle persists", async ({ browser }) => {
  const p = (await as(browser, "player")).page;
  await p.goto(`${new URL(p.url()).origin}/notifications`);
  await p.locator("a[href='/notifications/settings']").first().click();
  await p.waitForURL(/settings/);
  const toggles = p.locator("button[aria-pressed]");
  await expect(toggles.first()).toBeVisible({ timeout: 30_000 });
  const n = await toggles.count();
  const t = await mainText(p);
  log("settings toggles:", n, "channels mentioned:", ["email", "in-app", "in_app", "sms", "push"].filter((c) => t.toLowerCase().includes(c)));
  log("settings text:", t.slice(0, 1200));
  expect.soft(/broadcast|announcement/i.test(t), "settings list league announcements").toBe(true);
  expect.soft(/game|schedule/i.test(t), "settings list game-change alerts (UC-21)").toBe(true);
  const first = toggles.first();
  const label = await first.getAttribute("aria-label");
  const was = await first.getAttribute("aria-pressed");
  const respP = p.waitForResponse((r) => /me\/preferences/.test(r.url()) && r.request().method() === "PUT");
  await first.click();
  const resp = await respP;
  log(`toggle ${label} ${was} →`, resp.status());
  await p.reload();
  await expect(p.locator("button[aria-pressed]").first()).toBeVisible({ timeout: 30_000 });
  const now = await p.locator(`button[aria-label="${label}"]`).getAttribute("aria-pressed");
  expect.soft(now, "preference persisted after reload").not.toBe(was);
  await shot(p, "04-settings");
  // restore the original preference
  await p.locator(`button[aria-label="${label}"]`).click();
  await p.waitForTimeout(1000);
});

test("5. super_admin @ /communications outbox shows the broadcast; templates page renders", async ({ browser }) => {
  const p = (await as(browser, "superAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/dashboard`);
  if (!(await p.locator("a[href='/communications']:visible").count())) {
    await p.locator("summary:visible", { hasText: "Operations" }).first().click();
  }
  await p.locator("a[href='/communications']:visible").first().click();
  await p.waitForURL(/\/communications/);
  await p.waitForLoadState("networkidle").catch(() => {});
  const t = await mainText(p);
  log("SA outbox:", t.slice(0, 700));
  await shot(p, "05-sa-outbox");
  expect.soft(t, "outbox lists this run's broadcast").toContain(TAG);
  await p.goto(`${new URL(p.url()).origin}/communications/templates`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const tt = await mainText(p);
  log("templates:", tt.slice(0, 300));
  expect.soft(tt, "org.broadcast template listed").toMatch(/org\.broadcast|broadcast/i);
  await shot(p, "05b-templates");
  const statuses = await stagingSql(
    `select status, channel, count(*)::int n from notifications where body like $1 or subject = $2 group by status, channel`,
    [`%${TAG} QA broadcast%`, SUBJECT]
  );
  log("delivery statuses for the broadcast:", JSON.stringify(statuses));
});

test("6. captain @ team-admin /comms can message the team (UC-20)", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/`);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  const nav = p.locator("a[href='/comms']:visible").first();
  await expect(nav, "Communications in captain nav").toBeVisible();
  await nav.click();
  await p.waitForURL(/\/comms/);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  const t = await mainText(p);
  log("captain /comms:", t.slice(0, 400));
  await shot(p, "06-captain-comms");
  expect.soft(t, "captain team-message screen is built (not 'Coming soon')").not.toMatch(/Coming soon/i);
  expect.soft(await p.locator("main textarea").count(), "captain can draft a team message").toBeGreaterThan(0);
  const capNotif = await stagingSql(
    `select count(*)::int n from notifications n join persons pe on pe.id=n.recipient_person_id join profiles pr on pr.id=pe.user_id where pr.email='staging-team@sportspulse.us' and (n.subject=$1 or n.body like $2)`,
    [SUBJECT, `%${TAG} QA broadcast%`]
  );
  log("captain notification rows for the broadcast:", JSON.stringify(capNotif));
  log("team-admin links to a notifications inbox:", await p.locator("a[href*='notification']").count());
});

test("7. game-change notification (UC-21): does moving/postponing a game notify players?", async () => {
  const games = await stagingSql<{ n: number }>(`select count(*)::int n from games`);
  const gameNotifs = await stagingSql(`select template_code, count(*)::int n from notifications where template_code like 'game.%' group by template_code`);
  const rinkOutbox = await stagingSql(`select count(*)::int n from rink_notification_outbox`).catch((e) => [{ err: String(e) }]);
  log("games:", games[0]?.n, "game.* player notifications:", JSON.stringify(gameNotifs), "rink outbox:", JSON.stringify(rinkOutbox));
  test.skip((games[0]?.n ?? 0) === 0, "no games on staging yet (scheduling journey has not published any); UC-21 runtime check blocked");
  expect.soft(gameNotifs.length, "player-facing game-change notifications exist after schedule changes").toBeGreaterThan(0);
});
