import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql, watchErrors, type Role } from "./_helpers";

/**
 * J13 · Invoice, pay, refund, wallet credit, overdue (UC-15, UC-17, UC-18).
 *
 * super_admin @ superadmin-web /finance creates an invoice for the staging
 * player → player @ player-web /payments (own context) pays with the mock
 * card → admin sees the status on /finance and /finance/[id] → admin issues
 * refunds + wallet credit → player sees the credit and applies it to a
 * second invoice. Org-admin parity + isolation on org-admin-web /finance.
 *
 * "Paid" on staging = MockPaymentProcessor (no money moves, no Stripe).
 * Bugs are logged as MON-n in doc/testing/bugs/money.md.
 *
 * Steps are separate tests so one bug does not hide the next. Playwright
 * restarts the worker after a failing test, so the run tag and each role's
 * signed-in session are cached on disk per runner process (one sign-in
 * per role per run, which keeps us under Supabase's auth rate limit).
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

const ORG_NAME = "PPHL Staging";
const PLAYER_EMAIL = "staging-player@sportspulse.us";
const AMOUNT_A = "123.45"; // invoice A (paid + refunded)
const AMOUNT_B = "40.00"; // invoice B (paid with wallet credit)
const DESC_A = `${TAG} J13 invoice A`;
const DESC_B = `${TAG} J13 invoice B`;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/j13-${name}.png`, fullPage: true });
}
async function mainText(page: Page) {
  return (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
}
function log(...a: unknown[]) {
  console.log("[J13]", ...a);
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

/** Invoice ids for this run, read back from the DB (survives worker restarts). */
async function runInvoices() {
  const rows = await stagingSql<{ id: string; invoice_number: string; description: string; status: string; paid_cents: number }>(
    `select i.id, i.invoice_number, ii.description, i.status, i.paid_cents from invoices i
       join invoice_items ii on ii.invoice_id = i.id
      where ii.description in ($1, $2) and i.recipient_email = $3`,
    [DESC_A, DESC_B, PLAYER_EMAIL]
  );
  return {
    a: rows.find((r) => r.description === DESC_A),
    b: rows.find((r) => r.description === DESC_B)
  };
}

test("1. super_admin finds Invoices in the sidebar and the AR dashboard renders", async ({ browser }) => {
  const p = (await as(browser, "superAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/dashboard`);
  // Finance sits in a collapsible sidebar group ("Financials" since the
  // 25 Oct regrouping); open whichever group holds it, like a user would.
  const groups = p.locator("nav details:not([open]) > summary");
  // Each click opens a group, so the closed list shrinks: always take the first.
  for (let i = 0; i < 12 && (await groups.count()) && !(await p.locator("a[href='/finance']:visible").count()); i++) {
    await groups.first().click();
  }
  const link = p.locator("a[href='/finance']:visible").first();
  await expect(link, "sidebar has an Invoices link").toBeVisible();
  await link.click();
  await p.waitForURL(/\/finance$/);
  await expect(p.getByText("Total invoiced").first()).toBeVisible();
  log("AR before:", (await mainText(p)).slice(0, 400));
  await shot(p, "01-ar-dashboard");
});

test("2. '+ New invoice' opens the shared composer: individual invoice with payment plan", async ({ browser }) => {
  const p = (await as(browser, "superAdmin")).page;
  // The old dialog (raw UUID inputs, invalid kinds) was replaced by a link
  // to the shared composer org-admin also uses.
  await p.locator("main a", { hasText: "New invoice" }).first().click();
  await p.waitForURL(/\/finance\/create/);
  await expect(p.locator("select#scope")).toBeVisible({ timeout: 60_000 });
  const org = p.locator("select#org");
  if (await org.count()) {
    expect.soft(await org.locator("option").allTextContents(), "organisation picker lists the staging org").toContain(ORG_NAME);
    await org.selectOption({ label: ORG_NAME });
  }
  await p.locator("select#scope").selectOption("individual");
  const people = await p.locator("select#target option").allTextContents();
  log("individual picker:", JSON.stringify(people.slice(0, 10)));
  const player = people.find((o) => /Staging Player/.test(o));
  expect.soft(player, "recipient picker lists the staging player by name").toBeTruthy();
  if (player) await p.locator("select#target").selectOption({ label: player });
  await p.getByPlaceholder("e.g. 2026 Spring season registration").fill(`${TAG} J13 plan invoice`);
  await p.getByPlaceholder("0.00").first().fill("50.00");
  await p.locator("input[type='date']").first().fill(inTwoDaysIso());
  await p.getByLabel(/Pay in installments/i).check();
  await p.getByPlaceholder("0.00").last().fill("10.00");
  const respP = p.waitForResponse((r) => /\/finance\/invoices\/bulk/.test(r.url()), { timeout: 30_000 }).catch(() => null);
  await p.getByRole("button", { name: "Create and send" }).click();
  const resp = await respP;
  const status = resp?.status() ?? 0;
  const body = resp ? await resp.text().catch(() => "") : "no response";
  log("composer create →", status, body.slice(0, 300));
  await shot(p, "02-composer-plan-result");
  expect.soft(status, `invoice with payment plan created (${body.slice(0, 200)})`).toBeGreaterThanOrEqual(200);
  expect.soft(status, `invoice with payment plan created (${body.slice(0, 200)})`).toBeLessThan(300);
  const rows = await stagingSql<{ status: string; n: number }>(
    `select i.status, (select count(*)::int from installment_schedules s where s.invoice_id = i.id) n
       from invoices i join invoice_items it on it.invoice_id = i.id
      where it.description = $1 limit 1`,
    [`${TAG} J13 plan invoice`]
  );
  log("db invoice:", JSON.stringify(rows));
  expect.soft(rows[0]?.status, "created invoice is sent (visible to player, chased when overdue)").toBe("sent");
  expect.soft(rows[0]?.n ?? 0, "deposit + installments scheduled").toBeGreaterThan(1);
});

async function composeTeamInvoice(p: Page, desc: string, amount: string) {
  await p.goto(`${new URL(p.url()).origin}/finance`);
  await p.locator("main a[href='/finance/create'], header a[href='/finance/create'], a[href='/finance/create']").first().click();
  await p.waitForURL(/\/finance\/create/);
  await expect(p.locator("select#scope"), "composer form renders").toBeVisible({ timeout: 60_000 });
  const org = p.locator("select#org");
  if (await org.count()) await org.selectOption({ label: ORG_NAME });
  return { org };
}

test("3. /finance/create composer: individual picker, then invoices A and B to the player", async ({ browser }) => {
  const p = (await as(browser, "superAdmin")).page;
  await composeTeamInvoice(p, DESC_A, AMOUNT_A);
  // Default scope is Individual — the person picker must list people.
  const target = p.locator("select#target");
  const personOptions = await target.locator("option").allTextContents();
  log("composer individual options:", JSON.stringify(personOptions));
  await shot(p, "03-composer-individual");
  expect.soft(
    personOptions.some((o) => /Staging Player|staging-player/i.test(o)),
    "SA composer Individual scope lists the staging player (needs persons prop)"
  ).toBe(true);
  const kinds = await p.locator("form select").filter({ hasText: "Registration fee" }).first().locator("option").allTextContents();
  log("composer kinds:", kinds.join(","));
  expect.soft(await p.getByText(/payment plan|installment/i).count(), "composer offers a payment plan / installments (UC-15)").toBeGreaterThan(0);
  expect.soft(await p.getByText(/fee schedule/i).count(), "composer offers a fee schedule picker").toBeGreaterThan(0);

  for (const [desc, amt] of [
    [DESC_A, AMOUNT_A],
    [DESC_B, AMOUNT_B]
  ] as const) {
    if (!/\/finance\/create/.test(p.url())) await composeTeamInvoice(p, desc, amt);
    // Individual scope to the player: since MON-23 a Team invoice goes to the
    // captain to split on Dues (covered by J14), so the player-pays steps below
    // need invoices addressed to the player.
    await p.locator("select#scope").selectOption("individual");
    const playerOpt = (await p.locator("select#target option").allTextContents()).find((o) => /staging-player@/i.test(o));
    expect(playerOpt, "composer lists the staging player").toBeTruthy();
    await p.locator("select#target").selectOption({ label: playerOpt! });
    await p.getByPlaceholder("e.g. 2026 Spring season registration").fill(desc);
    await p.getByPlaceholder("0.00").first().fill(amt);
    await p.locator("input[type='date']").fill(inTwoDaysIso());
    const respP = p.waitForResponse((r) => /invoices\/bulk/.test(r.url()) && r.request().method() === "POST");
    await p.getByRole("button", { name: /^(Create and send|Create invoice)$/ }).click();
    const resp = await respP;
    const json = await resp.json().catch(() => ({}));
    log(`composer create ${desc} →`, resp.status(), JSON.stringify(json).slice(0, 200));
    expect(resp.status(), "composer invoice created").toBeLessThan(300);
    await p.waitForURL(/\/finance(\?|$)/, { timeout: 20_000 });
  }

  const rows = await stagingSql<{ id: string; status: string; total_cents: number; description: string; email: string }>(
    `select i.id, i.status, i.total_cents, ii.description, i.recipient_email as email
       from invoices i join invoice_items ii on ii.invoice_id = i.id
      where ii.description like $1 order by i.created_at`,
    [`${TAG} J13 invoice%`]
  );
  log("db invoices:", JSON.stringify(rows));
  const a = rows.find((r) => r.description === DESC_A && r.email === PLAYER_EMAIL);
  const b = rows.find((r) => r.description === DESC_B && r.email === PLAYER_EMAIL);
  expect(a, "invoice A row for the player").toBeTruthy();
  expect(b, "invoice B row for the player").toBeTruthy();
  const invoiceAId = a!.id;
  expect.soft(a!.status, "new invoice is issued to the player (not left as draft)").not.toBe("draft");
  const notif = await stagingSql(
    `select template_code, channel, status from notifications where payload::text like $1`,
    [`%${invoiceAId}%`]
  );
  log("notifications for invoice A:", JSON.stringify(notif));
  expect.soft(notif.length, "player is notified that an invoice was issued").toBeGreaterThan(0);
  await shot(p, "03b-ar-after-create");
});

test("4. player @ player-web /payments sees invoice A with the right total and pays (mock card)", async ({ browser }) => {
  const { a, b } = await runInvoices();
  test.skip(!a, "no invoice A for this run");
  const invoiceAId = a!.id;
  void b;
  const p = (await as(browser, "player")).page;
  await p.goto(`${new URL(p.url()).origin}/`);
  const nav = p.locator("a[href='/payments']:visible").first();
  await expect(nav, "Payments entry in the player nav").toBeVisible();
  await nav.click();
  await p.waitForURL(/\/payments/);
  await expect(p.getByText("$123.45").first(), "invoice A total visible").toBeVisible();
  await shot(p, "04-player-payments-before");
  // Older runs leave unpaid $123.45 invoices too: pick this run's by number.
  const card = p.locator("main div.rounded-xl").filter({ hasText: a!.invoice_number }).filter({ has: p.getByRole("button", { name: /^Pay / }) }).last();
  const mockSel = p.getByText(/Mock card outcome/i);
  await card.getByRole("button", { name: /^Pay \$123\.45/ }).click();
  const dlg = p.getByRole("dialog");
  await expect(dlg).toBeVisible();
  const mockVisible = await mockSel.isVisible().catch(() => false);
  log("player sees 'Mock card outcome' selector:", mockVisible);
  // Payments run in test mode by founder decision (MON-10, accepted): the
  // dialog says so and lets the tester pick the outcome. Card collection
  // and no-mock checks apply only once a card provider is live.
  const testMode = /test payment: no real card is charged/i.test(await dlg.innerText());
  log("pay dialog in test mode:", testMode);
  if (!testMode) {
    expect.soft(mockVisible, "player-facing pay dialog must not expose a test 'mock outcome' control").toBe(false);
    expect.soft(await dlg.locator("input[name*='card'], iframe[name*='stripe'], input[autocomplete='cc-number']").count(), "pay dialog collects a card").toBeGreaterThan(0);
  }
  await shot(p, "04b-pay-dialog");
  const respP = p.waitForResponse((r) => /\/finance\/invoices\/.+\/pay$/.test(r.url()));
  await dlg.getByRole("button", { name: "Pay now" }).click();
  const resp = await respP;
  log("pay →", resp.status(), (await resp.text()).slice(0, 200));
  expect(resp.status()).toBeLessThan(300);
  await expect(p.getByText(/Paid .* Invoice is paid/).first(), "flash confirms paid").toBeVisible();
  await shot(p, "04c-player-after-pay");
  const db = await stagingSql<{ status: string; paid_cents: number }>(`select status, paid_cents from invoices where id=$1`, [invoiceAId]);
  log("db after pay:", JSON.stringify(db));
  expect(db[0]?.status).toBe("paid");
  const pays = await stagingSql(`select method, amount_cents, external_provider_id from payments where invoice_id=$1`, [invoiceAId]);
  log("payments rows:", JSON.stringify(pays));
  const notif = await stagingSql(`select template_code, channel, status from notifications where idempotency_key like $1`, [`pay-confirmed-${invoiceAId}%`]);
  log("payment confirmation notifications:", JSON.stringify(notif));
});

test("5. admin sees invoice A paid on /finance list and /finance/[id]", async ({ browser }) => {
  const { a, b } = await runInvoices();
  test.skip(!a, "no invoice A for this run");
  const invoiceAId = a!.id;
  void b;
  const p = (await as(browser, "superAdmin")).page;
  // Admin page was open from before the payment: check without reload first.
  const before = await mainText(p);
  log("admin page (no reload) mentions 123.45:", before.includes("123.45"));
  // After "Create and send" the admin lands on the invoice page; the
  // check is on the list.
  await p.goto(`${new URL(p.url()).origin}/finance`);
  // 25 rows a page and each run adds 34 invoices: find it the way an admin would.
  await p.getByPlaceholder("Search name, email, invoice #").fill(a!.invoice_number);
  await p.getByPlaceholder("Search name, email, invoice #").press("Enter");
  await p.waitForURL(/[?&]q=/);
  const row = p.locator("tr").filter({ hasText: a!.invoice_number }).first();
  await expect.soft(row, "invoice A row on /finance").toBeVisible();
  await expect.soft(row, "row shows Paid").toContainText(/paid/i);
  await shot(p, "05-admin-finance-after-pay");
  await p.goto(`${new URL(p.url()).origin}/finance/${invoiceAId}`);
  await expect(p.getByText("Admin actions")).toBeVisible();
  log("invoice A detail:", (await mainText(p)).slice(0, 600));
  await shot(p, "05b-invoice-detail-paid");
});

test("6. internal notes save survives a reload", async ({ browser }) => {
  const { a, b } = await runInvoices();
  test.skip(!a, "no invoice A for this run");
  const invoiceAId = a!.id;
  void b;
  const p = (await as(browser, "superAdmin")).page;
  // Each step opens invoice A itself: a failed earlier step must not cascade.
  await p.goto(`${new URL(p.url()).origin}/finance/${invoiceAId}`);
  await expect(p.getByText("Admin actions")).toBeVisible();
  const note = `${TAG} internal note`;
  const ta = p.locator("textarea").first();
  await ta.fill(note);
  const saveP = p.waitForResponse((r) => /\/note$/.test(r.url()) && r.request().method() === "PUT");
  await p.getByRole("button", { name: "Save note" }).click();
  const save = await saveP;
  const flash = `${save.status()}`;
  log("save note →", save.status());
  expect(save.status(), "note saved").toBeLessThan(300);
  await p.reload();
  await expect(p.getByText("Admin actions")).toBeVisible();
  const persisted = (await p.locator("textarea").first().inputValue()) === note || (await mainText(p)).includes(note);
  expect.soft(persisted, `internal note persisted after reload (flash was "${flash}")`).toBe(true);
});

test("7. refund dialog (UC-17): wallet-credit refund updates the invoice and cannot exceed what was paid", async ({ browser }) => {
  const { a, b } = await runInvoices();
  test.skip(!a, "no invoice A for this run");
  const invoiceAId = a!.id;
  void b;
  const p = (await as(browser, "superAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/finance/${invoiceAId}`);
  await expect(p.getByText("Admin actions")).toBeVisible();
  async function refund(amount: string) {
    await p.getByRole("button", { name: "Issue refund" }).click();
    const dlg = p.getByRole("dialog");
    await dlg.getByRole("button", { name: /Wallet credit/ }).click();
    await dlg.locator("input").first().fill(amount);
    await dlg.locator("textarea, input[placeholder*='pro-rated']").first().fill(`${TAG} QA refund test reason`);
    const issue = dlg.getByRole("button", { name: /Issue refund of/ });
    if (await issue.isDisabled()) {
      // The dialog refuses before any request: record what it tells the admin.
      log(`refund ${amount} refused in the dialog:`, (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 300));
      await dlg.getByRole("button", { name: "Cancel" }).click().catch(() => {});
      return "refused-in-dialog" as const;
    }
    const respP = p.waitForResponse((r) => /refund-split/.test(r.url()));
    await issue.click();
    const resp = await respP;
    const t = await resp.text();
    log(`refund ${amount} →`, resp.status(), t.slice(0, 200));
    if (await dlg.isVisible().catch(() => false)) {
      log("refund dialog still open:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 300));
      await dlg.getByRole("button", { name: "Cancel" }).click().catch(() => {});
    }
    return resp.status();
  }
  const s1 = await refund("50.00");
  expect(s1, "first refund is accepted").not.toBe("refused-in-dialog");
  expect(s1).toBeLessThan(300);
  await p.waitForTimeout(1500);
  const afterFirst = await mainText(p);
  log("detail after first refund:", afterFirst.slice(0, 500));
  await shot(p, "07-after-refund-50");
  const db1 = await stagingSql<{ status: string; paid_cents: number }>(`select status, paid_cents from invoices where id=$1`, [invoiceAId]);
  log("db after refund 50:", JSON.stringify(db1));
  // MON-9: one refund command lowers paid (and total) by the refund.
  expect(db1[0]?.paid_cents, "refund reduces invoice paid_cents (12345 → 7345)").toBe(7345);

  // Second refund of the full original amount: 50 + 123.45 > 123.45 paid.
  const s2 = await refund("123.45");
  await shot(p, "07b-after-second-refund");
  expect(
    s2 === "refused-in-dialog" || s2 >= 400,
    `second refund that pushes total refunds above the paid amount is refused (got ${s2})`
  ).toBe(true);
  const totals = await stagingSql<{ refunded: number }>(`select coalesce(sum(amount_cents),0)::int as refunded from refunds where invoice_id=$1`, [invoiceAId]);
  log("total refunded on invoice A (cents):", totals[0]?.refunded);
  expect(totals[0]?.refunded ?? 0, "refunds never exceed the 12345 cents paid").toBeLessThanOrEqual(12345);
  const notif = await stagingSql(`select template_code, status from notifications where payload::text like $1 and template_code ilike '%refund%'`, [`%${invoiceAId}%`]);
  log("refund notifications:", JSON.stringify(notif));
  expect(notif.length, "player is notified of the refund/credit (UC-17)").toBeGreaterThan(0);
});

test("8. admin issues a standalone wallet credit from the invoice detail", async ({ browser }) => {
  const { a, b } = await runInvoices();
  test.skip(!a, "no invoice A for this run");
  const invoiceAId = a!.id;
  void b;
  const p = (await as(browser, "superAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/finance/${invoiceAId}`);
  await expect(p.getByText("Admin actions")).toBeVisible();
  await p.getByRole("button", { name: "Issue wallet credit" }).click();
  const dlg = p.getByRole("dialog");
  await expect(dlg).toBeVisible();
  const inputs = dlg.locator("input, textarea");
  await inputs.nth(0).fill("5.00");
  await inputs.nth(1).fill(`${TAG} goodwill credit QA`);
  const respP = p.waitForResponse((r) => /wallet\/issue-credit|wallet-credit/.test(r.url()));
  await dlg.getByRole("button", { name: /Issue|credit/i }).last().click();
  const resp = await respP;
  log("wallet credit →", resp.status(), (await resp.text()).slice(0, 200));
  expect.soft(resp.status()).toBeLessThan(300);
  await shot(p, "08-after-wallet-credit");
});

test("9. player sees wallet credit and applies it to invoice B", async ({ browser }) => {
  const { b } = await runInvoices();
  test.skip(!b, "no invoice B for this run");
  const p = (await as(browser, "player")).page;
  // A worker restart after a failure reopens the session on Home: go to Payments.
  if (!/\/payments/.test(p.url())) await p.goto(`${new URL(p.url()).origin}/payments`);
  const before = await mainText(p);
  log("player page before reload, wallet text:", before.match(/Wallet balance \S+/)?.[0]);
  await p.reload();
  const walletText = (await mainText(p)).match(/Wallet balance \S+/)?.[0] ?? "";
  log("player wallet after reload:", walletText);
  const db = await stagingSql<{ balance_cents: number }>(
    `select w.balance_cents from wallet_accounts w join persons pe on pe.id=w.person_id join profiles pr on pr.id=pe.user_id where pr.email=$1`,
    [PLAYER_EMAIL]
  );
  log("db wallet:", JSON.stringify(db));
  expect(walletText, "wallet balance shown to the player").not.toMatch(/\$0\.00/);
  await shot(p, "09-player-wallet");
  const card = p.locator("main div.rounded-xl").filter({ hasText: "$40.00" }).filter({ has: p.getByRole("button", { name: /^Pay / }) }).last();
  await card.getByRole("button", { name: /^Pay \$40\.00/ }).click();
  const dlg = p.getByRole("dialog");
  await dlg.locator("input[type='number']").first().fill("40.00");
  const respP = p.waitForResponse((r) => /\/finance\/invoices\/.+\/pay$/.test(r.url()));
  await dlg.getByRole("button", { name: "Pay now" }).click();
  const resp = await respP;
  log("pay B with wallet →", resp.status(), (await resp.text()).slice(0, 200));
  expect(resp.status()).toBeLessThan(300);
  await expect(p.getByText(/from wallet/).first()).toBeVisible();
  await shot(p, "09b-player-after-wallet-pay");
  const ledger = await stagingSql(
    `select 'ledger' src, entry_type t, amount_cents from wallet_ledger wl join wallet_accounts w on w.id=wl.wallet_id join persons pe on pe.id=w.person_id join profiles pr on pr.id=pe.user_id where pr.email=$1
     union all select 'tx', type, amount_cents from wallet_transactions wt join wallet_accounts w on w.id=wt.wallet_id join persons pe on pe.id=w.person_id join profiles pr on pr.id=pe.user_id where pr.email=$1`,
    [PLAYER_EMAIL]
  ).catch((e) => [{ err: String(e) }]);
  const bal = await stagingSql<{ balance_cents: number }>(
    `select w.balance_cents from wallet_accounts w join persons pe on pe.id=w.person_id join profiles pr on pr.id=pe.user_id where pr.email=$1`,
    [PLAYER_EMAIL]
  );
  log("wallet ledger:", JSON.stringify(ledger), "balance:", JSON.stringify(bal));
});

test("10. receipt and update-card affordances", async ({ browser }) => {
  const { a, b } = await runInvoices();
  test.skip(!a, "no invoice A for this run");
  const invoiceAId = a!.id;
  void b;
  const p = (await as(browser, "player")).page;
  if (!/\/payments/.test(p.url())) await p.goto(`${new URL(p.url()).origin}/payments`);
  await expect(p.getByRole("heading").first()).toBeVisible();
  // MON-18: open invoices with a payment show "Download receipt"; paid ones
  // in history show "Receipt".
  const receiptBtns = await p.getByRole("button", { name: /^(Download receipt|Receipt)$/ }).count();
  log("Download receipt buttons on page:", receiptBtns);
  const history = (await mainText(p)).match(/history.{0,200}/i)?.[0];
  log("history section:", history);
  expect.soft(receiptBtns, "a paid invoice offers a receipt download").toBeGreaterThan(0);
  const upd = p.getByRole("button", { name: "Update card" }).first();
  if (await upd.isVisible().catch(() => false)) {
    await upd.click();
    const dlg = p.getByRole("dialog");
    log("update card dialog:", (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300));
    await shot(p, "10-update-card");
    expect.soft(await dlg.getByText(/stub/i).count(), "Update card is a real card form, not a stub").toBe(0);
    await p.keyboard.press("Escape");
  } else {
    log("no Update card button visible (no open invoices)");
  }
});

test("11. overdue (UC-18): escalation view and what triggers reminders", async ({ browser }) => {
  const p = (await as(browser, "superAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/payments?tab=overdue`);
  await shot(p, "11-overdue-tab");
  const od = await mainText(p);
  log("overdue tab:", od.slice(0, 700));
  expect.soft(od, "overdue / QB panel shows no fabricated sample rows").not.toContain("INV-2025-08841");
  // The daily pg_cron sweep only considers invoices in sent/partial/overdue.
  const draft = await stagingSql<{ n: number }>(
    `select count(*)::int n from invoices i join invoice_items ii on ii.invoice_id=i.id where ii.description like $1 and i.status='draft'`,
    [`${TAG} J13%`]
  );
  log("this run's invoices still in draft (invisible to sp_overdue_sweep):", draft[0]?.n);
  // MON-11: invoices from "Create and send" are sent, so the sweep sees them.
  expect(draft[0]?.n ?? 0, "this run's invoices are sent, not drafts").toBe(0);
  const cron = await stagingSql(`select jobname, schedule from cron.job where jobname like '%overdue%'`);
  log("overdue cron:", JSON.stringify(cron));
  // MON-11: the 0053 sweep reports per-invoice failures instead of aborting.
  const fn = await stagingSql<{ result: string }>(
    `select pg_get_function_result('public.sp_overdue_sweep'::regproc) as result`
  );
  expect(fn[0]?.result ?? "", "overdue sweep is the 0053 version").toContain("invoices_failed");
  const lastRun = await stagingSql<{ status: string; return_message: string; start_time: string }>(
    `select d.status, d.return_message, d.start_time from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname = 'sp-daily-overdue-sweep' order by d.start_time desc limit 1`
  ).catch(() => []);
  log("last overdue sweep run:", JSON.stringify(lastRun));
  expect.soft(lastRun[0]?.status ?? "succeeded", "last overdue sweep run did not fail").toBe("succeeded");
});

test("12. org-admin @ org-admin-web /finance parity and isolation", async ({ browser }) => {
  const oa = await as(browser, "orgAdmin");
  const errs = oa.errors;
  const p = oa.page;
  try {
    await p.goto(`${new URL(p.url()).origin}/`);
    const nav = p.locator("a[href='/finance']:visible").first();
    await expect(nav, "Finance in org-admin nav").toBeVisible();
    await nav.click();
    await p.waitForURL(/\/finance/);
    await expect(p.getByText("Loading organization workspace")).toHaveCount(0, { timeout: 60_000 });
    await p.waitForLoadState("networkidle").catch(() => {});
    await shot(p, "12-org-finance");
    const text = await mainText(p);
    log("org-admin /finance:", text.slice(0, 600));
    expect.soft(text, "org-admin sees this run's invoice").toContain("123.45");
    // Detail parity: is there a per-invoice detail with refund / notes?
    const detailLinks = await p.locator("a[href^='/finance/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    log("org-admin finance links:", JSON.stringify(detailLinks.slice(0, 10)));
    await p.goto(`${new URL(p.url()).origin}/finance/create`);
    await expect(p.locator("select#target")).toBeVisible({ timeout: 60_000 });
    const opts = await p.locator("select#target").locator("option").allTextContents();
    log("org-admin composer individual options:", JSON.stringify(opts));
    expect.soft(opts.some((o) => /Staging Player|staging-player/i.test(o)), "org-admin composer lists the player").toBe(true);
    await shot(p, "12b-org-composer");
    // Same shared composer, org-admin proxy endpoint: invoice the player directly.
    await p.locator("select#target").selectOption({ label: "Staging Player · staging-player@sportspulse.us" });
    await p.getByPlaceholder("e.g. 2026 Spring season registration").fill(`${TAG} J13 org-admin invoice`);
    await p.getByPlaceholder("0.00").first().fill("12.34");
    await p.locator("input[type='date']").fill(inTwoDaysIso());
    const respP = p.waitForResponse((r) => /invoices\/bulk/.test(r.url()) && r.request().method() === "POST");
    await p.getByRole("button", { name: /^(Create and send|Create invoice)$/ }).click();
    const resp = await respP;
    const t = await resp.text();
    log("org-admin composer create →", resp.status(), t.slice(0, 200));
    await p.waitForTimeout(1000);
    await shot(p, "12c-org-composer-result");
    const visibleErr = await p.locator("[role='alert'], .text-rose-600").allInnerTexts().catch(() => []);
    log("org-admin composer visible error:", JSON.stringify(visibleErr));
    expect.soft(resp.status(), `org-admin can invoice a player (${t.slice(0, 120)})`).toBeLessThan(300);
    // Isolation: no row from another org.
    const otherOrgs = await stagingSql<{ invoice_number: string }>(
      `select invoice_number from invoices where org_id <> (select id from orgs where display_name=$1) limit 20`,
      [ORG_NAME]
    );
    for (const r of otherOrgs) expect.soft(text, "foreign-org invoice not visible").not.toContain(r.invoice_number);
  } finally {
    log("OA errors:", JSON.stringify(errs));
  }
});

test("13. player pays only the next installment of the plan invoice; cards say what each invoice is for", async ({ browser }) => {
  // The plan invoice from test 2: $50.00, $10.00 deposit, 3 installments.
  const rows = await stagingSql<{ id: string; invoice_number: string; paid_cents: number }>(
    `select i.id, i.invoice_number, i.paid_cents from invoices i join invoice_items it on it.invoice_id = i.id
      where it.description = $1 limit 1`,
    [`${TAG} J13 plan invoice`]
  );
  test.skip(!rows[0], "no plan invoice for this run");
  const inv = rows[0]!;
  const p = (await as(browser, "player")).page;
  await p.goto(`${new URL(p.url()).origin}/payments`);
  const card = p.locator("main div.rounded-xl").filter({ hasText: inv.invoice_number }).first();
  await expect(card, "plan invoice card").toBeVisible();
  // Titled by the admin's line, never the old hard-coded "Registration fee".
  await expect(card.getByText(`${TAG} J13 plan invoice`).first(), "card title is the admin's description").toBeVisible();
  expect.soft(await card.getByText("Registration fee", { exact: true }).count(), "no hard-coded Registration fee label").toBe(0);
  const next = card.getByRole("button", { name: /^Pay next installment \$10\.00/ });
  await expect(next, "a plan offers the next installment, not only the whole balance").toBeVisible();
  await expect(card.getByRole("button", { name: /^Pay all \$50\.00/ })).toBeVisible();
  await next.click();
  const dlg = p.getByRole("dialog");
  await expect(dlg.getByLabel("Amount to pay now")).toHaveValue("10.00");
  await shot(p, "13-pay-next-installment");
  const respP = p.waitForResponse((r) => /\/finance\/invoices\/.+\/pay$/.test(r.url()));
  await dlg.getByRole("button", { name: "Pay now" }).click();
  const resp = await respP;
  log("pay next installment →", resp.status(), (await resp.text()).slice(0, 200));
  expect(resp.status()).toBeLessThan(300);
  const db = await stagingSql<{ status: string; paid_cents: number }>(`select status, paid_cents from invoices where id = $1`, [inv.id]);
  expect(db[0], "invoice paid 10.00 of 50.00").toMatchObject({ status: "partial", paid_cents: 1000 });
  const plan = await stagingSql<{ n: number; status: string }>(`select installment_number n, status from installment_schedules where invoice_id = $1 order by 1`, [inv.id]);
  expect(plan[0]?.status, "deposit row marked paid").toBe("succeeded");
  expect(plan.slice(1).every((r) => r.status === "scheduled"), "later installments still open").toBe(true);
  // Same page, no reload: the card now offers the following installment.
  await expect(card.getByRole("button", { name: /^Pay next installment/ })).toBeVisible();
});

test("14. composer: a Discount line lowers the total; a late fee is stored on the invoice", async ({ browser }) => {
  const p = (await as(browser, "superAdmin")).page;
  await composeTeamInvoice(p, "", "");
  await p.locator("select#scope").selectOption("individual");
  const playerOpt = (await p.locator("select#target option").allTextContents()).find((o) => /staging-player@/i.test(o));
  expect(playerOpt, "composer lists the staging player").toBeTruthy();
  await p.locator("select#target").selectOption({ label: playerOpt! });
  await p.getByPlaceholder("e.g. 2026 Spring season registration").fill(`${TAG} J13 discounted fee`);
  await p.getByPlaceholder("0.00").first().fill("100.00");
  await p.getByRole("button", { name: "Add line" }).click();
  const second = p.locator("form div.grid.grid-cols-12").nth(1);
  await second.locator("select").selectOption("discount");
  await second.locator("input").first().fill(`${TAG} sibling discount`);
  await second.locator("input[type='number']").last().fill("10.00");
  await expect(p.getByText("$90.00").first(), "total shows 100 - 10").toBeVisible();
  await p.getByLabel(/Late fee \(USD\)/).fill("5.00");
  // A discount over the charges blocks the form.
  await second.locator("input[type='number']").last().fill("150.00");
  await expect(p.getByText(/cannot go below zero/)).toBeVisible();
  await expect(p.getByRole("button", { name: "Create and send" })).toBeDisabled();
  await second.locator("input[type='number']").last().fill("10.00");
  await p.locator("input[type='date']").first().fill(inTwoDaysIso());
  await shot(p, "14-composer-discount");
  const respP = p.waitForResponse((r) => /invoices\/bulk/.test(r.url()) && r.request().method() === "POST");
  await p.getByRole("button", { name: "Create and send" }).click();
  const resp = await respP;
  expect(resp.status(), "discounted invoice created").toBeLessThan(300);
  const rows = await stagingSql<{ total_cents: number; discount_cents: number; late_fee_cents: number }>(
    `select i.total_cents, i.discount_cents, i.late_fee_cents from invoices i join invoice_items it on it.invoice_id = i.id
      where it.description = $1 limit 1`,
    [`${TAG} J13 discounted fee`]
  );
  expect(rows[0], "invoice total 90.00 with a 10.00 discount and a 5.00 late fee").toMatchObject({ total_cents: 9000, discount_cents: 1000, late_fee_cents: 500 });
});
