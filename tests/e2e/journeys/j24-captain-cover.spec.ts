import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql, watchErrors, type Role } from "./_helpers";

/**
 * J24 · Captain covers a missing balance (UC-16, finance gap 3).
 *
 * Needs J14 (this run's team invoice split into player shares on the
 * staging team). Without it the journey is BLOCKED.
 *
 *   captain @ team-admin-web /captain/dues → an unpaid share, Pay, a
 *       partial amount, Pay: the row shows the new paid amount without a
 *       reload; db-row: payment on the share with the captain as payer
 *   captain → Pay again with the rest: the share reads Paid
 *   db-row: one notice to the player, one receipt to the captain per cover
 *   player @ player-web /payments → the share's balance, when the share is
 *       the staging player's
 */

test.skip(!IS_STAGING, "journeys mutate data: staging only");
test.describe.configure({ timeout: 180_000 });

const OUT = process.env.E2E_OUTPUT_DIR ?? "test-results";
const SHOTS = `${OUT}-shots`;
const STATE = `${OUT}-state`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(STATE, { recursive: true });
// Same run tag file as J14 (money journeys share one tag per runner process).
const TAG_FILE = `${STATE}/money-tag-${process.ppid}.txt`;
if (!existsSync(TAG_FILE)) writeFileSync(TAG_FILE, process.env.E2E_RUN_TAG ?? RUN_TAG);
const TAG = readFileSync(TAG_FILE, "utf8").trim();
const CAPTAIN_EMAIL = "staging-team@sportspulse.us";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/j24-${name}.png`, fullPage: true });
}
function log(...a: unknown[]) {
  console.log("[J24]", ...a);
}

type Session = { context: BrowserContext; page: Page; app: string; errors: string[] };
const sessions: Partial<Record<Role, Session>> = {};
async function as(browser: Browser, role: Role): Promise<Session> {
  const cached = sessions[role];
  if (cached && !cached.page.isClosed()) return cached;
  const s = await signedInAs(browser, role);
  sessions[role] = { ...s, errors: watchErrors(s.page) };
  return sessions[role]!;
}
test.afterAll(async () => {
  for (const [role, s] of Object.entries(sessions)) {
    log(`${role} console/API errors:`, JSON.stringify(s?.errors ?? []));
    await s?.context.close();
  }
});

/** J14's team invoice for this run, from the database. */
async function runTeamInvoiceId(): Promise<string | null> {
  const rows = await stagingSql<{ id: string }>(
    `select i.id from invoices i join invoice_items ii on ii.invoice_id = i.id
      where ii.description = $1 and i.invoice_type = 'team_dues' order by i.created_at desc limit 1`,
    [`${TAG} J14 team dues`]
  );
  return rows[0]?.id ?? null;
}

type Share = { id: string; invoice_number: string; total_cents: number; paid_cents: number; email: string | null };
async function shares(masterId: string): Promise<Share[]> {
  return stagingSql<Share>(
    `select i.id, i.invoice_number, i.total_cents, i.paid_cents, coalesce(pr.email, i.recipient_email) email
       from invoices i left join persons pe on pe.id = i.recipient_person_id left join profiles pr on pr.id = pe.user_id
      where i.parent_invoice_id = $1 and i.invoice_type = 'sub_invoice' order by i.invoice_number`,
    [masterId]
  );
}

let masterId: string | null = null;
let target: Share | null = null;

test("1. captain pays part of an unpaid share from Dues; the row updates in place", async ({ browser }) => {
  masterId = await runTeamInvoiceId();
  test.skip(!masterId, "BLOCKED: no J14 team invoice for this run; run j14-dues-split.spec.ts first");
  const list = await shares(masterId!);
  target = list.find((s) => s.paid_cents < s.total_cents && s.total_cents - s.paid_cents >= 200) ?? null;
  test.skip(!target, "every share on the run's team invoice is paid; nothing to cover");
  const p = (await as(browser, "teamAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/captain/dues?invoiceId=${masterId}`);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  await expect(p.getByText("Player splits")).toBeVisible({ timeout: 60_000 });
  const owed = target!.total_cents - target!.paid_cents;
  const part = Math.floor(owed / 2);
  const row = p.locator("tbody tr").nth((await shares(masterId!)).findIndex((s) => s.id === target!.id));
  const paidBefore = (await row.innerText()).replace(/\s+/g, " ");
  await row.getByRole("button", { name: /^Pay for / }).click();
  const dialog = p.getByRole("dialog");
  await expect(dialog.getByText(new RegExp(target!.invoice_number))).toBeVisible();
  await dialog.getByLabel("Amount to pay").fill((part / 100).toFixed(2));
  await shot(p, "01-dialog");
  const respP = p.waitForResponse((r) => /\/captain\/dues\/[^/]+\/cover\//.test(r.url()) && r.request().method() === "POST");
  const pay = dialog.getByRole("button", { name: /^Pay \$/ });
  // Double click: the button is disabled while the first request runs and the
  // dialog key makes a repeat a replay, so the captain is charged once.
  await pay.dblclick();
  const resp = await respP;
  log("cover →", resp.status(), (await resp.text()).slice(0, 160));
  expect(resp.status(), "cover accepted").toBeLessThan(300);
  await expect(p.getByText(/Paid \$[\d,.]+ for .*They have been told\./)).toBeVisible({ timeout: 30_000 });
  // Same surface, no reload.
  await expect.poll(async () => (await row.innerText()).replace(/\s+/g, " ")).not.toBe(paidBefore);
  await shot(p, "01-after-partial");
  const [after] = await stagingSql<{ paid_cents: number }>("select paid_cents from invoices where id = $1", [target!.id]);
  expect(after!.paid_cents, "share paid amount went up by the part (db-row)").toBe(target!.paid_cents + part);
  const pays = await stagingSql<{ amount_cents: number; payer: string | null; src: string | null }>(
    `select amount_cents, metadata->>'payerUserId' payer, metadata->>'source' src from payments where invoice_id = $1 and metadata->>'source' = 'captain_cover'`,
    [target!.id]
  );
  expect(pays.length, "one payment for the double click (db-row)").toBe(1);
  expect(pays[0]!.amount_cents).toBe(part);
  const [cap] = await stagingSql<{ id: string }>("select id from profiles where email = $1", [CAPTAIN_EMAIL]);
  expect(pays[0]!.payer, "the captain is the payer").toBe(cap!.id);
});

test("2. captain pays the rest; the share reads Paid; both sides notified", async ({ browser }) => {
  test.skip(!target || !masterId, "BLOCKED: step 1 did not run");
  const p = (await as(browser, "teamAdmin")).page;
  const idx = (await shares(masterId!)).findIndex((s) => s.id === target!.id);
  const row = p.locator("tbody tr").nth(idx);
  await row.getByRole("button", { name: /^Pay for / }).click();
  const dialog = p.getByRole("dialog");
  // The amount starts at what is still owed.
  const respP = p.waitForResponse((r) => /\/captain\/dues\/[^/]+\/cover\//.test(r.url()) && r.request().method() === "POST");
  await dialog.getByRole("button", { name: /^Pay \$/ }).click();
  expect((await respP).status()).toBeLessThan(300);
  await expect(p.getByText(/Their share is paid\./)).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText("Paid", { exact: true })).toBeVisible();
  await shot(p, "02-paid");
  const [inv] = await stagingSql<{ paid_cents: number; total_cents: number; status: string }>(
    "select paid_cents, total_cents, status from invoices where id = $1",
    [target!.id]
  );
  expect(inv!.paid_cents, "share fully paid (db-row)").toBe(inv!.total_cents);
  expect(inv!.status).toBe("paid");
  const notes = await stagingSql<{ template_code: string }>(
    "select template_code from notifications where payload->>'invoiceId' = $1 and source_event = 'captain.cover_share'",
    [target!.id]
  );
  expect(notes.filter((n) => n.template_code === "captain.covered_dues").length, "player told for each cover").toBe(2);
  expect(notes.filter((n) => n.template_code === "captain.cover_receipt").length, "captain receipt for each cover").toBe(2);
});

test("3. the player's Payments page shows the covered share", async ({ browser }) => {
  test.skip(!target, "BLOCKED: step 1 did not run");
  test.skip(target!.email !== "staging-player@sportspulse.us", `the covered share belongs to ${target!.email}, a user this run cannot sign in as`);
  const p = (await as(browser, "player")).page;
  await p.goto(`${new URL(p.url()).origin}/payments`);
  await expect(p.getByText(target!.invoice_number).first()).toBeVisible({ timeout: 60_000 });
  await shot(p, "03-player-payments");
});
