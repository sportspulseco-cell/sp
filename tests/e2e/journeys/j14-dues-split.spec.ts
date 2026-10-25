import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql, watchErrors, type Role } from "./_helpers";

/**
 * J14 · Captain splits team dues (UC-16).
 *
 * captain @ team-admin-web /captain/dues: team invoice, even + custom split
 * across the roster, per-player remind, remind-all → each player @ player-web
 * /payments sees their share. Also checks how a team invoice reaches the
 * dues screen at all (admin composer vs captain registration).
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
const TEAM_NAME = "Staging Skaters";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/j14-${name}.png`, fullPage: true });
}
async function mainText(page: Page) {
  return (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
}
function log(...a: unknown[]) {
  console.log("[J14]", ...a);
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

async function openDues(p: Page) {
  await p.goto(`${new URL(p.url()).origin}/`);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  const nav = p.locator("a[href='/captain/dues']:visible").first();
  await expect(nav, "Dues in the captain console nav").toBeVisible();
  await nav.click();
  await p.waitForURL(/\/captain\/dues/);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  await p.waitForLoadState("networkidle").catch(() => {});
}

/** This run's team invoice (step 2), from the database: survives worker restarts. */
async function runTeamInvoiceId(): Promise<string | null> {
  const rows = await stagingSql<{ id: string }>(
    `select i.id from invoices i join invoice_items ii on ii.invoice_id = i.id
      where ii.description = $1 and i.invoice_type = 'team_dues' order by i.created_at desc limit 1`,
    [`${TAG} J14 team dues`]
  );
  return rows[0]?.id ?? null;
}

/** Open Dues on this run's team invoice (as the email link does), else the default one. */
async function openRunInvoice(p: Page): Promise<string | null> {
  const id = await runTeamInvoiceId();
  if (!id) {
    await openDues(p);
    return null;
  }
  await p.goto(`${new URL(p.url()).origin}/captain/dues?invoiceId=${id}`);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  return id;
}

test("1. captain finds Dues; screen shows the team invoice or a clear next step", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  await openDues(p);
  const t = await mainText(p);
  log("captain /captain/dues:", t.slice(0, 700));
  await shot(p, "01-dues");
  const dte = await stagingSql(
    `select dte.entry_status, dte.invoice_id, d.name division from division_team_entries dte join teams t on t.id=dte.team_id join divisions d on d.id=dte.division_id where t.name=$1`,
    [TEAM_NAME]
  );
  log("db: division entries for the team:", JSON.stringify(dte));
  // A confirmed team with no master invoice is sent to "/captain/register" — which
  // refuses a team that is already registered. Assert the empty state does not
  // point at a dead end.
  if (/No dues to track/.test(t)) {
    await p.goto(`${new URL(p.url()).origin}/captain/register`);
    await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
    await p.waitForLoadState("networkidle").catch(() => {});
    const r = await mainText(p);
    log("captain /captain/register (the suggested next step):", r.slice(0, 600));
    await shot(p, "01b-register");
    expect.soft(/no dues|already registered|registered/i.test(r) && !/Register the team/i.test(r) ? "dead-end" : "ok",
      "the 'Run the rollover wizard' next step leads somewhere that can create team dues").toBe("ok");
  }
});

test("2. a team-scope invoice from the admin composer reaches the captain dues screen", async ({ browser }) => {
  // UC-16 precondition: "Team invoice created (full season dues)". The only admin
  // UI for a team invoice is /finance/create with scope=Team.
  const p = (await as(browser, "superAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/finance/create`);
  await expect(p.locator("select#scope")).toBeVisible({ timeout: 60_000 });
  const org = p.locator("select#org");
  if (await org.count()) await org.selectOption({ label: "PPHL Staging" });
  await p.locator("select#scope").selectOption("team");
  await p.locator("select#target").selectOption({ label: TEAM_NAME });
  await p.getByPlaceholder("e.g. 2026 Spring season registration").fill(`${TAG} J14 team dues`);
  await p.getByPlaceholder("0.00").first().fill("600.00");
  await p.locator("input[type='date']").fill(inTwoDaysIso());
  const respP = p.waitForResponse((r) => /invoices\/bulk/.test(r.url()) && r.request().method() === "POST");
  await p.getByRole("button", { name: "Create and send" }).click();
  const resp = await respP;
  const body = await resp.text();
  log("admin team invoice →", resp.status(), body.slice(0, 200));
  await shot(p, "02-admin-team-invoice");
  expect.soft(resp.status(), `admin can create a team invoice (${body.slice(0, 120)})`).toBeLessThan(300);
  // MON-23: a Team invoice is one team_dues invoice to the captain, who opens
  // it on Dues (from the picker, or the email link) and splits it.
  const inv = JSON.parse(body || "{}")?.invoices?.[0];
  const rows = await stagingSql<{ invoice_type: string; team_id: string }>(
    `select invoice_type, team_id from invoices where id = $1`,
    [inv?.id ?? "00000000-0000-4000-8000-000000000000"]
  );
  expect.soft(rows[0]?.invoice_type, "composer Team scope writes one team invoice").toBe("team_dues");
  const c = (await as(browser, "teamAdmin")).page;
  await openDues(c);
  const picker = c.locator("select").filter({ has: c.locator("option", { hasText: inv?.invoiceNumber ?? "none" }) });
  await expect.soft(picker, "the captain can pick the new team invoice on Dues").toHaveCount(1);
  if (await picker.count()) {
    await picker.selectOption({ label: (await picker.locator("option", { hasText: inv.invoiceNumber }).innerText()).trim() });
    await expect(c.getByText("Split the team fee")).toBeVisible({ timeout: 30_000 });
  }
  const t = await mainText(c);
  log("captain dues after admin team invoice:", t.slice(0, 300));
  expect.soft(t, "captain sees the team invoice on /captain/dues").toContain("$600.00");
});

test("3. split controls: even + custom split persist; per-player remind works", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  const invId = await openRunInvoice(p);
  // UC-16: the team invoice from step 2 has no shares yet; split it evenly.
  if (await p.getByText("Split the team fee").count()) {
    const splitP = p.waitForResponse((r) => /\/captain\/dues\/[^/]+\/split$/.test(r.url()) && r.request().method() === "POST", { timeout: 90_000 });
    await p.getByRole("button", { name: "Split and send invoices" }).click();
    const sr = await splitP;
    log("first split →", sr.status());
    expect(sr.status(), "captain splits the team invoice").toBeLessThan(300);
    await expect(p.getByText(/Split sent: \d+ players?/)).toBeVisible({ timeout: 30_000 });
  }
  const hasTracker = await p.getByText("Player splits").count();
  test.skip(!hasTracker, "no master team invoice on staging: /captain/dues shows the empty state, split UI unreachable (see test 1/2)");
  log("dues tracker:", (await mainText(p)).slice(0, 900));
  await shot(p, "03-dues-tracker");
  const sel = p.locator("main select").filter({ hasText: "Even split" }).first();
  await sel.selectOption("custom");
  const amounts = p.locator("main tbody input");
  const n = await amounts.count();
  log("split rows:", n);
  test.skip(n < 2, "a custom split needs two shares to move money between");
  // Move $1.00 between two shares: the total is unchanged, so the server
  // must accept it (MON-8). A share can never drop below what that player
  // already paid (the server refuses with 422), so take the dollar from a
  // share that still has room; try the pairs in turn.
  const save = p.getByRole("button", { name: "Save split" });
  let resp: import("@playwright/test").Response | null = null;
  let want0 = "";
  let to = 0;
  for (let from = n - 1; from >= 0 && (!resp || resp.status() === 422); from--) {
    to = from === 0 ? 1 : 0;
    const aTo = Number(await amounts.nth(to).inputValue());
    const aFrom = Number(await amounts.nth(from).inputValue());
    if (aFrom < 1) continue;
    want0 = (aTo + 1).toFixed(2);
    await amounts.nth(to).fill(want0);
    await amounts.nth(from).fill((aFrom - 1).toFixed(2));
    await p.keyboard.press("Tab");
    await expect(save, "Save split enabled when shares add up to the team fee").toBeEnabled();
    const respP = p.waitForResponse((r) => /\/captain\/dues\/[^/]+\/split$/.test(r.url()) && r.request().method() === "POST");
    await save.click();
    resp = await respP;
    log(`save split (row ${from} -> row ${to}) →`, resp.status(), (await resp.text()).slice(0, 200));
    if (resp.status() === 422) {
      // Refused for a paid share: put the inputs back before the next pair.
      await amounts.nth(to).fill(aTo.toFixed(2));
      await amounts.nth(from).fill(aFrom.toFixed(2));
    }
  }
  if (resp?.status() === 422) {
    // Every share is already paid in full: lowering any of them is refused
    // with a readable reason (MON-8), so there is nothing left to move.
    expect(await resp.text(), "the refusal names the paid share").toMatch(/already paid/);
    test.skip(true, "every share on the staging team is fully paid; the server correctly refuses to lower a paid share");
  }
  expect(resp?.status() ?? 0, "custom split is persisted to the server").toBeLessThan(300);
  await expect(p.getByText("Custom split saved.")).toBeVisible({ timeout: 20_000 });
  // Same surface, no reload: the row shows the stored amount.
  await expect(amounts.nth(to)).toHaveValue(want0);
  // Durable record: the master invoice remembers the method.
  const [m] = invId
    ? await stagingSql<{ method: string | null }>(
        `select metadata->>'splitMethod' method from invoices where id = $1`,
        [invId]
      )
    : await stagingSql<{ method: string | null }>(
        `select i.metadata->>'splitMethod' method from invoices i
           join division_team_entries dte on dte.invoice_id = i.id
           join teams t on t.id = dte.team_id
          where t.name = $1 order by i.created_at desc limit 1`,
        [TEAM_NAME]
      );
  expect(m?.method, "master invoice records the custom split").toBe("custom");
  await p.reload();
  await expect(p.getByText("Player splits")).toBeVisible({ timeout: 60_000 });
  const mode = await p.locator("main select").filter({ hasText: "Even split" }).first().inputValue();
  expect(mode, "split mode survives a reload").toBe("custom");
  await expect(p.locator("main tbody input").nth(to)).toHaveValue(want0);
  const remind = p.getByRole("button", { name: /^Remind$/ }).first();
  if (await remind.isVisible().catch(() => false)) {
    const respP = p.waitForResponse((r) => /remind/.test(r.url()));
    await remind.click();
    const resp = await respP;
    log("per-player remind →", resp.url(), resp.status(), (await resp.text()).slice(0, 200));
    await p.waitForTimeout(800);
    log("visible after remind:", (await mainText(p)).match(/(Reminder[^.]*\.|Split not found[^.]*|error[^.]*)/i)?.[0]);
    await shot(p, "03b-after-remind");
    expect.soft(resp.status(), "per-player remind succeeds").toBeLessThan(300);
  }
});

test("4. each player sees their share on player-web /payments", async ({ browser }) => {
  const invId = await runTeamInvoiceId();
  const subs = invId
    ? await stagingSql<{ invoice_number: string; total_cents: number; email: string }>(
        `select i.invoice_number, i.total_cents, coalesce(pr.email, i.recipient_email) email from invoices i
           left join persons pe on pe.id = i.recipient_person_id
           left join profiles pr on pr.id = pe.user_id
          where i.parent_invoice_id = $1 and i.invoice_type = 'sub_invoice'`,
        [invId]
      )
    : await stagingSql<{ invoice_number: string; total_cents: number; email: string }>(
        `select i.invoice_number, i.total_cents, i.recipient_email email, i.recipient_person_id from invoices i
           join division_team_entries dte on dte.invoice_id = i.parent_invoice_id
           join teams t on t.id = dte.team_id
          where t.name=$1 and i.invoice_type='sub_invoice'`,
        [TEAM_NAME]
      );
  log("sub-invoices for the team:", JSON.stringify(subs));
  test.skip(subs.length === 0, "no team dues split exists for the staging team; nothing for players to see (blocked by tests 1-2)");
  const mine = subs.find((s) => s.email === PLAYER_EMAIL);
  test.skip(!mine, `the team's dues split has no share for ${PLAYER_EMAIL} (recipients: ${subs.map((s) => s.email).join(", ")}); the other recipients are users this run cannot sign in as`);
  const p = (await as(browser, "player")).page;
  await p.goto(`${new URL(p.url()).origin}/payments`);
  await expect(p.getByText(mine!.invoice_number).first()).toBeVisible();
});

test("5. captain 'Remind all unpaid' writes reminders that admins can see in the outbox", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  await openRunInvoice(p);
  const btn = p.getByRole("button", { name: /Remind all unpaid/ });
  test.skip(!(await btn.count()), "no dues tracker for the staging team");
  // Disabled is right when nobody owes anything; the flow is then not exercised.
  if (await btn.isDisabled()) {
    const t = await mainText(p);
    log("Remind all unpaid disabled; screen:", t.match(/\d+ players? outstanding/)?.[0]);
    expect(t, "disabled only because no player is outstanding").toMatch(/\b0 players outstanding/);
    test.skip(true, "every share on the staging team is paid: nothing to remind");
  }
  const before = await stagingSql<{ n: number }>(`select count(*)::int n from notifications`);
  const respP = p.waitForResponse((r) => /remind-all/.test(r.url()));
  await btn.click();
  const resp = await respP;
  log("remind-all →", resp.status(), (await resp.text()).slice(0, 200));
  expect.soft(resp.status(), "remind-all succeeds").toBeLessThan(300);
  await p.waitForTimeout(800);
  log("captain flash:", (await mainText(p)).match(/(Queued[^.]*\.|Nothing to remind[^.]*\.)/)?.[0]);
  const after = await stagingSql<{ n: number }>(`select count(*)::int n from notifications`);
  const rows = await stagingSql(`select template_code, channel, status, recipient_email from notifications order by created_at desc limit 5`);
  log("notifications before/after:", before[0]?.n, after[0]?.n, JSON.stringify(rows));
  // Destination: super_admin outbox should list the queued reminders.
  const sa = (await as(browser, "superAdmin")).page;
  await sa.goto(`${new URL(sa.url()).origin}/communications`);
  await sa.waitForLoadState("networkidle").catch(() => {});
  const t = await mainText(sa);
  log("SA outbox after remind-all:", t.slice(0, 400));
  await shot(sa, "05-sa-outbox-after-remind-all");
  expect.soft(/No notifications/.test(t) && (after[0]?.n ?? 0) > 0 ? "outbox empty while db has rows" : "ok",
    "SA outbox shows the reminder rows that exist in the database").toBe("ok");
});
