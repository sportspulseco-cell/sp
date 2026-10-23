import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql, watchErrors, type Role } from "./_helpers";

/**
 * J16 · Team store (UC-25, UC-26).
 *
 * captain @ team-admin-web /captain/store adds a product → player @
 * player-web /store (own context) sees it → tries to order it.
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

const TEAM_NAME = "Staging Skaters";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/j16-${name}.png`, fullPage: true });
}
async function mainText(page: Page) {
  return (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
}
function log(...a: unknown[]) {
  console.log("[J16]", ...a);
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

const PRODUCT = `${TAG} Home jersey`;

test("1. captain adds a product at team-admin /captain/store", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/`);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  const nav = p.locator("a[href='/captain/store']:visible").first();
  await expect(nav, "Team store in the captain console nav").toBeVisible();
  await nav.click();
  await p.waitForURL(/\/captain\/store/);
  await expect(p.getByRole("button", { name: "Add product" })).toBeVisible({ timeout: 60_000 });
  const before = await mainText(p);
  log("captain store before:", before.slice(0, 400));
  // UC-25: "Generate Team Store" from roster (names + numbers) — is there such an action?
  expect.soft(/generate|from roster/i.test(before), "captain can generate the store from the roster (UC-25)").toBe(true);
  await p.getByRole("button", { name: "Add product" }).click();
  await p.getByPlaceholder("Home jersey").fill(PRODUCT);
  await p.getByPlaceholder("Medium · Royal").fill("Large · Black");
  await p.getByPlaceholder("49.99").fill("59.00");
  await p.getByPlaceholder("50").fill("10");
  await p.getByPlaceholder("Optional details — sizing, material, deadline…").fill(`${TAG} QA product`);
  await shot(p, "01-new-product");
  const respP = p.waitForResponse((r) => /captain\/store/.test(r.url()) && r.request().method() === "POST");
  await p.locator("main").getByRole("button", { name: /^(Create|Add|Save)/ }).last().click();
  const resp = await respP;
  log("create product →", resp.status(), (await resp.text()).slice(0, 200));
  expect(resp.status()).toBeLessThan(300);
  await expect(p.getByText(PRODUCT).first(), "product appears in the captain list without reload").toBeVisible();
  await shot(p, "01b-product-created");
  const db = await stagingSql(`select name, price_cents, stock_qty, is_active from team_store_products where name=$1`, [PRODUCT]).catch((e) => [{ err: String(e) }]);
  log("db product:", JSON.stringify(db));
});

test("2. player @ player-web /store sees the product and tries to order it (UC-26)", async ({ browser }) => {
  const p = (await as(browser, "player")).page;
  await p.goto(`${new URL(p.url()).origin}/`);
  const nav = p.locator("a[href='/store']:visible").first();
  await expect(nav, "Team store in player nav").toBeVisible();
  await nav.click();
  await p.waitForURL(/\/store/);
  await p.waitForLoadState("networkidle").catch(() => {});
  const t = await mainText(p);
  log("player /store:", t.slice(0, 600));
  await shot(p, "02-player-store");
  await expect(p.getByText(PRODUCT).first(), "player sees the captain's product").toBeVisible();
  const card = p.locator("article").filter({ hasText: PRODUCT }).first();
  const cardText = (await card.innerText()).replace(/\s+/g, " ");
  log("product card:", cardText);
  const buy = card.getByRole("button", { name: /buy|order|add to cart|checkout/i });
  expect.soft(await buy.count(), "player can order the product (UC-26: personalise, cart, checkout)").toBeGreaterThan(0);
  expect.soft(/name|number|personal/i.test(cardText), "product offers name/number personalisation (UC-26)").toBe(true);
});

test("3. cleanup: captain deactivates the QA product", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  await p.goto(`${new URL(p.url()).origin}/captain/store`);
  await expect(p.getByRole("button", { name: "Add product" })).toBeVisible({ timeout: 60_000 });
  // Remove every QA product from this run (the smallest container holding the name + an Edit button).
  const row = p.locator("main div").filter({ hasText: PRODUCT }).filter({ has: p.getByRole("button", { name: "Edit" }) }).last();
  const del = row.getByRole("button").last();
  if (await del.isVisible().catch(() => false)) {
    p.once("dialog", (d) => d.accept());
    await del.click();
    await p.waitForTimeout(1500);
  }
  const left = await stagingSql(`select count(*)::int n from team_store_products where name=$1`, [PRODUCT]).catch(() => [{ n: -1 }]);
  log("QA products left after cleanup:", JSON.stringify(left));
});
