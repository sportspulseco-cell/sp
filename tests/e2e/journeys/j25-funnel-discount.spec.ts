import { test, expect, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH, OUTPUT_DIR } from "../../../playwright.config";
import { IS_STAGING, RUN_TAG, stagingSql, watchErrors } from "./_helpers";

/**
 * J25 · Discount code at registration (finance gap 1).
 *
 * Needs J3 (an open RUN_TAG season with a published form and the
 * "<runTag> Adult" price). Without its state file the journey is BLOCKED.
 *
 *   super_admin @ superadmin-web /finance/discounts → creates a 10% code,
 *       one use, for the J3 season (dialog, then the row in the table)
 *   new player @ player-web /register/[seasonId]   → path, account,
 *       details, documents, price, review, payment step: types the code in
 *       lower case with spaces, Apply, the invoice shows the discount line
 *       and the lower total; Pay
 *   db-row: invoice subtotal / discount / total and a negative discount line
 *   super_admin                                    → the code shows 1 use;
 *       Uses lists the player and the invoice
 *   a second new player                            → the used-up code is
 *       refused with a sentence; the price stays full
 */

const J3_STATE = `${OUTPUT_DIR}-state/registration-j03.json`;
const SHOTS = `${OUTPUT_DIR}/j23`;
const PASSWORD = "E2e!Pass-2026x";
const CODE = `J25${RUN_TAG.slice(-6)}`;

async function newCtx(browser: Browser) {
  return browser.newContext({
    ...(IS_STAGING && existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {}),
    timezoneId: "America/New_York"
  });
}
async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Walks a new adult player from the path cards to the payment step. */
async function walkToPayment(page: Page, j3: Record<string, string>, who: { first: string; last: string; email: string }) {
  await page.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
  await page.getByRole("button", { name: /Register as a player/i }).click();
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("tab", { name: /create account/i }).click();
  await page.getByLabel(/^First name/).first().fill(who.first);
  await page.getByLabel(/^Last name/).first().fill(who.last);
  await page.getByLabel(/^Email address/).first().fill(who.email);
  await page.getByLabel(/^Date of birth/).first().fill("1990-05-05");
  await page.getByLabel(/^Password/).first().fill(PASSWORD);
  await page.getByLabel(/^Confirm password/).first().fill(PASSWORD);
  await page.getByRole("button", { name: /Next: Details/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: /Next: Compliance/ })).toBeVisible({ timeout: 30_000 });
  const usa = page.getByPlaceholder("e.g. 1234567890").first();
  if (await usa.isVisible().catch(() => false)) await usa.fill("ABC12345");
  const level = page.locator("select").filter({ has: page.locator("option", { hasText: /Pick a level/ }) }).first();
  if (await level.count()) await level.selectOption("B");
  await page.getByRole("button", { name: /^Center$/ }).click().catch(() => {});
  const avail = page.getByRole("button", { name: /^(mon|tue|wed|thu|fri|sat|sun)$/i }).first();
  if (await avail.isVisible().catch(() => false)) await avail.click();
  const jersey = page.getByLabel(/Preferred jersey number/).first();
  if (await jersey.isVisible().catch(() => false)) await jersey.fill("23");
  await page.getByRole("button", { name: /Next: Compliance/ }).click();
  await expect(page.getByText(/Automated eligibility checks/i).first()).toBeVisible({ timeout: 30_000 });
  const docs = page.locator("div.max-h-48.overflow-y-auto");
  for (let i = 0; i < (await docs.count()); i++) {
    await docs.nth(i).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll"));
    });
  }
  const nameInput = page.getByLabel(/Type your full legal name to sign/i).first();
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(`${who.first} ${who.last}`);
    await page.getByRole("button", { name: /^Sign$/ }).first().click();
    await expect(page.getByText(/^Signed$/i).first()).toBeVisible({ timeout: 30_000 });
  }
  const coc = page.getByRole("switch", { name: /Code of conduct/i });
  if (await coc.isVisible().catch(() => false)) await coc.click();
  await page.getByRole("button", { name: /Next: Payment/ }).click();
  const tierCard = page.getByText(new RegExp(`${j3.runTag} Adult`)).first();
  await expect(tierCard).toBeVisible({ timeout: 30_000 });
  await tierCard.click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page.getByTestId("funnel-invoice-lines")).toBeVisible({ timeout: 30_000 });
}

test.describe.serial("J25 · discount code at registration", () => {
  test.skip(!IS_STAGING, "journeys mutate data — staging only");
  test.setTimeout(240_000);

  let j3: Record<string, string> = {};
  let codeId = "";
  let submissionId = "";
  const playerA = { first: "Dee", last: `${RUN_TAG}Disc`, email: `staging-e2e+${RUN_TAG.toLowerCase()}-disc@sportspulse.us` };
  const playerB = { first: "Bea", last: `${RUN_TAG}Late`, email: `staging-e2e+${RUN_TAG.toLowerCase()}-late@sportspulse.us` };

  test.beforeAll(() => {
    if (existsSync(J3_STATE)) j3 = JSON.parse(readFileSync(J3_STATE, "utf8"));
  });

  test("1 · admin creates a one-use 10% code on /finance/discounts", async ({ browser }) => {
    test.skip(!j3.seasonId, "BLOCKED: J3 state file missing — run j03-form.spec.ts first");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    const errs = watchErrors(page);
    await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
    // Found from Finance, not typed: the Discounts link on the invoices page.
    await page.goto(`${E2E_URLS.superadmin}/finance`);
    await page.getByRole("link", { name: /^Discounts$/ }).click();
    await page.waitForURL(/\/finance\/discounts/);
    await page.goto(`${E2E_URLS.superadmin}/finance/discounts?season=${j3.seasonId}`);
    await page.getByRole("button", { name: /New code/ }).first().click();
    await page.getByRole("dialog").getByLabel(/^Code/).fill(CODE.toLowerCase());
    await page.getByRole("dialog").getByLabel(/^Percent off/).fill("10");
    await page.getByRole("dialog").getByLabel(/^Usage limit/).fill("1");
    await shot(page, "01-new-code");
    await page.getByRole("button", { name: /Create code/ }).click();
    await expect(page.getByText(`${CODE} created.`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("cell", { name: new RegExp(CODE) }).first()).toBeVisible();
    await shot(page, "01-code-listed");
    const rows = await stagingSql<{ id: string; percent_basis_points: number; usage_limit: number; usage_count: number }>(
      "select id, percent_basis_points, usage_limit, usage_count from discount_codes where season_id = $1 and code = $2",
      [j3.seasonId, CODE]
    );
    expect(rows.length, "code stored upper case for the season (db-row)").toBe(1);
    expect(rows[0]!.percent_basis_points).toBe(1000);
    expect(rows[0]!.usage_limit).toBe(1);
    codeId = rows[0]!.id;
    expect(errs.filter((e) => /http 5/.test(e)), "no 5xx on the discounts page").toEqual([]);
    await ctx.close();
  });

  test("2 · new player applies the code at the payment step and pays the lower total", async ({ browser }) => {
    test.skip(!codeId, "BLOCKED: no code from step 1");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await walkToPayment(page, j3, playerA);
    const lines = page.getByTestId("funnel-invoice-lines");
    const before = (await lines.innerText()).replace(/\s+/g, " ");
    await page.getByLabel("Discount code").fill(` ${CODE.toLowerCase()} `);
    await page.getByRole("button", { name: /^Apply$/ }).click();
    await expect(page.getByText(new RegExp(`Discount code ${CODE} applied`))).toBeVisible({ timeout: 30_000 });
    // Same surface, no reload: the discount line and the new total.
    await expect(lines.getByText(new RegExp(`Discount code ${CODE} \\(10% off\\)`))).toBeVisible();
    const after = (await lines.innerText()).replace(/\s+/g, " ");
    expect(after, `the total changed after Apply (before: ${before})`).not.toBe(before);
    await shot(page, "02-code-applied");
    const [reg] = await stagingSql<{ id: string }>(
      "select id from registrations where season_id = $1 and metadata->>'email' = $2",
      [j3.seasonId, playerA.email]
    );
    submissionId = reg!.id;
    const payBtn = page.getByRole("button", { name: /^Pay \$/ });
    await payBtn.click();
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toHaveCount(0, { timeout: 60_000 });
    await shot(page, "02-paid");
    const [inv] = await stagingSql<{ id: string; subtotal_cents: number; discount_cents: number; total_cents: number; paid_cents: number }>(
      "select id, subtotal_cents, discount_cents, total_cents, paid_cents from invoices where registration_id = $1",
      [submissionId]
    );
    expect(inv, "invoice written (db-row)").toBeTruthy();
    expect(inv!.discount_cents, "10% of the price taken off").toBe(Math.round(inv!.subtotal_cents / 10));
    expect(inv!.total_cents).toBe(inv!.subtotal_cents - inv!.discount_cents);
    const items = await stagingSql<{ kind: string; amount_cents: number }>("select kind, amount_cents from invoice_items where invoice_id = $1", [inv!.id]);
    expect(items.some((i) => i.kind === "discount" && i.amount_cents === -inv!.discount_cents), "a discount line that subtracts").toBe(true);
    expect(items.reduce((s, i) => s + i.amount_cents, 0), "lines add up to the total").toBe(inv!.total_cents);
    await ctx.close();
  });

  test("3 · admin sees the use on the code", async ({ browser }) => {
    test.skip(!submissionId, "BLOCKED: no paid registration from step 2");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await signIn(page, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
    await page.goto(`${E2E_URLS.superadmin}/finance/discounts?season=${j3.seasonId}`);
    const row = page.getByRole("row").filter({ hasText: CODE });
    await expect(row.getByText(/^1 of 1/)).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: /^Uses$/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(playerA.email)).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("Counted")).toBeVisible();
    await shot(page, "03-uses");
    await ctx.close();
  });

  test("4 · the used-up code is refused for the next player", async ({ browser }) => {
    test.skip(!submissionId, "BLOCKED: no paid registration from step 2");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await walkToPayment(page, j3, playerB);
    const lines = page.getByTestId("funnel-invoice-lines");
    const before = (await lines.innerText()).replace(/\s+/g, " ");
    await page.getByLabel("Discount code").fill(CODE);
    await page.getByRole("button", { name: /^Apply$/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /used the most times it allows/ })).toBeVisible({ timeout: 30_000 });
    expect((await lines.innerText()).replace(/\s+/g, " "), "price unchanged after the refusal").toBe(before);
    await shot(page, "04-used-up");
    const [reg] = await stagingSql<{ code: string | null }>(
      "select metadata->>'discountCode' code from registrations where season_id = $1 and metadata->>'email' = $2",
      [j3.seasonId, playerB.email]
    );
    expect(reg?.code ?? null, "a refused code is not stored (db-row)").toBeNull();
    await ctx.close();
  });
});
