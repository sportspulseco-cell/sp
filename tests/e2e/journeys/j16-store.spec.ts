import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { IS_STAGING, RUN_TAG, openNav, signedInAs, stagingSql, watchErrors, type Role } from "./_helpers";

/**
 * J16 · Team store (UC-25, UC-26), the store as rebuilt in MON-15 (8663a4a).
 *
 * captain @ team-admin-web opens Team store from the menu and generates
 * the jersey, hoodie and cap from the roster at their own prices →
 * player @ player-web opens Team store from the menu, orders the jersey
 * with a size and the name and number for the back → the order shows
 * on the player's store as awaiting payment and its invoice on Payments
 * → the captain sees it unpaid and cannot fulfil it → the player pays
 * the invoice (mock card) → the captain marks it processing, then
 * shipped with a pickup note → the player sees Shipped and the note.
 * Database rows are read back after each step. Cleanup removes the
 * order, its invoice, payment and notices, and the products this run
 * generated.
 *
 * Steps are separate tests so one bug does not hide the next. The run
 * tag, the ids each step needs, and each role's signed-in session are
 * kept on disk per runner process, so a worker restart after a failure
 * keeps them and does not hit Supabase's auth rate limit.
 * Bugs: doc/testing/bugs/money.md (MON-n), console.md (CONSOLE-n).
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
const PLAYER_EMAIL = "staging-player@sportspulse.us";
const BUYER_NAME = "Staging Player";
const JERSEY = `${TEAM_NAME} jersey`;
/** The captain's prices (UC-25: nothing is priced for them). */
const PRICES = { Jersey: "59.00", Hoodie: "45.00", Cap: "20.00" } as const;
const JERSEY_TOTAL = "$59.00";
const SIZE = "L";
const NOTE = `${TAG} pick up at Thursday's game`;

/** What later steps need from earlier ones; survives a worker restart. */
type Run = {
  teamId?: string;
  playerPersonId?: string;
  backName?: string;
  rosterNumber?: number | null;
  number?: number;
  preexistingProductIds?: string[];
  createdProductIds?: string[];
  jerseyId?: string;
  orderId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  lineLabel?: string;
};
const RUN_FILE = `${STATE}/j16-run-${process.ppid}.json`;
function run(): Run {
  return existsSync(RUN_FILE) ? (JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run) : {};
}
function remember(patch: Run) {
  writeFileSync(RUN_FILE, JSON.stringify({ ...run(), ...patch }, null, 1));
}
function need<K extends keyof Run>(key: K): NonNullable<Run[K]> {
  const v = run()[key];
  if (v === undefined || v === null) throw new Error(`J16: ${String(key)} missing; an earlier step did not get that far`);
  return v as NonNullable<Run[K]>;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/j16-${name}.png`, fullPage: true });
}
async function mainText(page: Page) {
  return (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
}
function log(...a: unknown[]) {
  console.log("[J16]", ...a);
}
const origin = (p: Page) => new URL(p.url()).origin;

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

/**
 * Open the store from the app's menu, the way the user finds it. When
 * the menu has no store entry that is a finding (soft, so the test
 * fails), and the page is opened by URL so the rest of the walk still
 * runs and later bugs are not hidden behind this one.
 */
async function openStoreFromNav(p: Page, href: string, what: string) {
  await expect(p.locator("nav").first()).toBeVisible({ timeout: 60_000 });
  const links = p.locator(`nav a[href='${href}']`);
  const n = await links.count();
  expect.soft(n, `${what}: a Team store entry in the navigation (no other link to ${href} exists)`).toBeGreaterThan(0);
  if (n > 0) {
    await openNav(p, /store/i);
  } else {
    log(`${what}: no menu entry for ${href}; opened by URL to continue the walk`);
    await p.goto(`${origin(p)}${href}`);
  }
  await p.waitForURL(new RegExp(`${href.replace(/\//g, "\\/")}$`));
}

/** The captain's order card: buyer, total and the line as ordered. */
function captainOrder(p: Page) {
  return p
    .locator("main li")
    .filter({ hasText: BUYER_NAME })
    .filter({ hasText: need("lineLabel") })
    .first();
}
/** The player's order card under "Your orders". */
function playerOrder(p: Page) {
  return p.locator("main li").filter({ hasText: need("lineLabel") }).filter({ hasText: JERSEY_TOTAL }).first();
}

test("1. captain opens Team store from the menu and generates the store from the roster (UC-25)", async ({ browser }) => {
  const [team] = await stagingSql<{ id: string }>(`select id from teams where name = $1`, [TEAM_NAME]);
  expect(team, `team "${TEAM_NAME}" exists on staging`).toBeTruthy();
  const before = await stagingSql<{ id: string; kind: string | null }>(
    `select id, metadata->>'kind' kind from team_store_products where team_id = $1 and metadata->>'generated' = 'true'`,
    [team!.id]
  );
  remember({ teamId: team!.id, preexistingProductIds: before.map((r) => r.id) });
  log("generated products before:", JSON.stringify(before));

  const p = (await as(browser, "teamAdmin")).page;
  await p.goto(`${origin(p)}/`);
  await expect(p.getByText("Loading team workspace")).toHaveCount(0, { timeout: 60_000 });
  await openStoreFromNav(p, "/captain/store", "captain console");
  await expect(p.getByRole("heading", { name: "Team store", exact: true })).toBeVisible({ timeout: 60_000 });
  log("captain store:", (await mainText(p)).slice(0, 500));

  const gen = p.locator("section").filter({ hasText: "Generate from the roster" });
  if (before.length >= 3) {
    // Someone generated the store already: nothing is offered again; use their jersey.
    await expect(gen, "generate is not offered again once all items exist").toHaveCount(0);
    log("store already generated before this run; using the existing jersey");
  } else {
    await expect(gen).toBeVisible();
    const posts: string[] = [];
    p.on("request", (r) => {
      if (r.method() === "POST" && /\/captain\/store\/[^/]+\/generate$/.test(r.url())) posts.push(r.url());
    });
    // Unhappy path: no price set → refused in the form, nothing sent.
    await gen.getByRole("button", { name: "Generate store" }).click();
    await expect(gen.getByRole("alert")).toContainText(/Set a price for the/i);
    expect(posts.length, "no request without a price").toBe(0);

    for (const [label, price] of Object.entries(PRICES)) {
      const box = gen.getByLabel(label, { exact: true });
      if ((await box.count()) === 0) continue; // already generated earlier
      await expect(box).toBeChecked();
      await gen.getByLabel(`${label} price`).fill(price);
    }
    // Do not email the whole staging roster from a test run (not verified here).
    await gen.getByLabel("Email the players on the roster that the store is open").uncheck();
    await shot(p, "01-generate-form");
    const respP = p.waitForResponse((r) => /\/captain\/store\/[^/]+\/generate$/.test(r.url()) && r.request().method() === "POST");
    await gen.getByRole("button", { name: "Generate store" }).click();
    const resp = await respP;
    const body = await resp.text();
    log("generate →", resp.status(), body.slice(0, 300));
    expect(resp.status()).toBeLessThan(300);
    // Same page, no reload: the flash, the new products, and generate is no longer offered.
    await expect(p.getByText(/^Added .*jersey.* to the store\./i)).toBeVisible();
    await expect(gen, "generate disappears once every item exists").toHaveCount(0);
  }
  await expect(p.locator("main li").filter({ hasText: JERSEY }).first(), "jersey in the captain's product list without reload").toBeVisible();
  await shot(p, "01b-store-generated");

  const after = await stagingSql<{ id: string; name: string; price_cents: number; stock_qty: number | null; is_active: boolean; metadata: any }>(
    `select id, name, price_cents, stock_qty, is_active, metadata from team_store_products
      where team_id = $1 and metadata->>'generated' = 'true' order by created_at`,
    [need("teamId")]
  );
  log("db generated products:", JSON.stringify(after.map((r) => ({ name: r.name, price: r.price_cents, kind: r.metadata?.kind }))));
  const created = after.filter((r) => !need("preexistingProductIds").includes(r.id));
  remember({ createdProductIds: created.map((r) => r.id) });
  const jersey = after.find((r) => r.metadata?.kind === "jersey");
  expect(jersey, "a generated jersey exists").toBeTruthy();
  remember({ jerseyId: jersey!.id });
  if (created.some((r) => r.id === jersey!.id)) {
    expect(jersey!.name).toBe(JERSEY);
    expect(jersey!.price_cents, "captain's jersey price stored").toBe(5900);
    expect(jersey!.is_active).toBe(true);
    expect(jersey!.metadata.personalization).toEqual({ name: true, number: true });
    expect(jersey!.metadata.sizes).toContain(SIZE);
  }
  // Every item this run generated is at the captain's price.
  const want: Record<string, number> = { jersey: 5900, hoodie: 4500, cap: 2000 };
  expect(created.length, "generate created each item not already in the store").toBe(3 - Math.min(3, need("preexistingProductIds").length));
  for (const r of created) {
    expect(r.price_cents, `${r.metadata?.kind} at the captain's price`).toBe(want[r.metadata?.kind]);
    expect(r.stock_qty, "generated items have no stock limit").toBeNull();
  }
});

test("2. player opens Team store from the menu and orders the jersey with name and number (UC-26)", async ({ browser }) => {
  const [me] = await stagingSql<{ person_id: string; last: string | null; jersey_number: string | null }>(
    `select p.id person_id, p.legal_last_name last, tm.jersey_number
       from profiles pr join persons p on p.user_id = pr.id
       join team_memberships tm on tm.person_id = p.id and tm.team_id = $2 and tm.current_status = 'active'
      where pr.email = $1 order by tm.created_at desc limit 1`,
    [PLAYER_EMAIL, need("teamId")]
  );
  expect(me, "staging player is on the team's roster").toBeTruthy();
  const rosterNumber = me!.jersey_number === null ? null : Number(me!.jersey_number);
  const backName = (me!.last ?? "").toUpperCase();
  const number = rosterNumber ?? 12;
  const lineLabel = `${JERSEY} · ${SIZE} · #${number} ${backName}`.trim();
  remember({ playerPersonId: me!.person_id, backName, rosterNumber, number, lineLabel });
  const prior = await stagingSql<{ n: number }>(
    `select count(*)::int n from team_store_orders where team_id = $1 and buyer_person_id = $2`,
    [need("teamId"), me!.person_id]
  );
  log("player's earlier orders on this team:", prior[0]?.n);

  const p = (await as(browser, "player")).page;
  await p.goto(`${origin(p)}/`);
  await openStoreFromNav(p, "/store", "player app");
  await expect(p.getByRole("heading", { name: `${TEAM_NAME} store` })).toBeVisible({ timeout: 60_000 });
  await shot(p, "02-player-store");
  log("player /store:", (await mainText(p)).slice(0, 500));

  const card = p.locator("article").filter({ hasText: JERSEY }).first();
  await expect(card, "player sees the captain's jersey").toBeVisible();
  await expect(card).toContainText(JERSEY_TOTAL);
  await card.getByRole("button", { name: "Order" }).click();

  const dlg = p.getByRole("dialog", { name: JERSEY });
  await expect(dlg).toBeVisible();
  // Roster data for the back is filled in (UC-25/26).
  await expect(dlg.getByLabel("Name on the back"), "name prefilled from the roster").toHaveValue(backName);
  await expect(dlg.getByLabel("Number on the back"), "number prefilled from the roster (blank when the roster has none)").toHaveValue(
    rosterNumber === null ? "" : String(rosterNumber)
  );
  // Unhappy path: a jersey needs a size.
  await dlg.getByRole("button", { name: /^Add to cart/ }).click();
  await expect(dlg.getByRole("alert")).toHaveText("Pick a size.");
  await dlg.getByLabel("Size").selectOption(SIZE);
  if (rosterNumber === null) await dlg.getByLabel("Number on the back").fill(String(number));
  await shot(p, "02b-picker");
  await dlg.getByRole("button", { name: `Add to cart · ${JERSEY_TOTAL}` }).click();
  await expect(dlg).toHaveCount(0);

  const cart = p.getByRole("region", { name: "Cart" });
  await expect(cart, "cart reads like the back of the shirt").toContainText(lineLabel);
  const respP = p.waitForResponse((r) => /\/team-store\/[^/]+\/orders$/.test(r.url()) && r.request().method() === "POST");
  await cart.getByRole("button", { name: `Place order · ${JERSEY_TOTAL}` }).click();
  const resp = await respP;
  const body = await resp.text();
  log("place order →", resp.status(), body.slice(0, 400));
  expect(resp.status()).toBeLessThan(300);
  const { order } = JSON.parse(body) as { order: { id: string; invoice: { id: string; number: string } | null } };
  expect(order.invoice, "the order has an invoice").toBeTruthy();
  remember({ orderId: order.id, invoiceId: order.invoice!.id, invoiceNumber: order.invoice!.number });

  // Same page, no reload: confirmation with the pay link, and the order under "Your orders".
  await expect(p.getByText(`Order placed. Total ${JERSEY_TOTAL}.`)).toBeVisible();
  await expect(p.getByText(`Pay invoice ${order.invoice!.number} to confirm it.`)).toBeVisible();
  const mine = playerOrder(p);
  await expect(mine).toBeVisible();
  await expect(mine).toContainText(/placed/i);
  await expect(mine.getByRole("link", { name: `Pay invoice ${order.invoice!.number}` })).toBeVisible();
  await expect(mine.getByRole("button", { name: "Cancel order" }), "an unpaid order can be cancelled").toBeVisible();
  await shot(p, "02c-order-placed");

  const [o] = await stagingSql<any>(
    `select o.status, o.total_cents, o.buyer_person_id, o.invoice_id, i.invoice_number, i.status inv_status, i.total_cents inv_total,
            i.paid_cents, i.recipient_person_id, i.team_id, i.metadata->>'kind' inv_kind, i.metadata->>'orderId' inv_order
       from team_store_orders o join invoices i on i.id = o.invoice_id where o.id = $1`,
    [order.id]
  );
  log("db order + invoice:", JSON.stringify(o));
  expect(o).toMatchObject({
    status: "placed",
    total_cents: 5900,
    buyer_person_id: me!.person_id,
    invoice_number: order.invoice!.number,
    inv_status: "sent",
    inv_total: 5900,
    paid_cents: 0,
    recipient_person_id: me!.person_id,
    team_id: need("teamId"),
    inv_kind: "store_order",
    inv_order: order.id
  });
  const items = await stagingSql<any>(
    `select product_id, product_name, unit_price_cents, quantity, size, personal_name, personal_number, backorder
       from team_store_order_items where order_id = $1`,
    [order.id]
  );
  log("db order items:", JSON.stringify(items));
  expect(items).toEqual([
    {
      product_id: need("jerseyId"),
      product_name: JERSEY,
      unit_price_cents: 5900,
      quantity: 1,
      size: SIZE,
      personal_name: backName || null,
      personal_number: number,
      backorder: false
    }
  ]);
  const invItems = await stagingSql<{ kind: string; amount_cents: number }>(
    `select kind, amount_cents from invoice_items where invoice_id = $1`,
    [order.invoice!.id]
  );
  expect(invItems, "one invoice line for the jersey").toEqual([{ kind: "store_item", amount_cents: 5900 }]);
  // The notice row is the evidence; delivery is not, because staging has
  // no email key (rows end "failed: RESEND_API_KEY not configured").
  const notices = await stagingSql<{ status: string; last_error: string | null }>(
    `select status, last_error from notifications where idempotency_key = $1`,
    [`store.order.placed:${order.id}`]
  );
  log("order confirmation notice:", JSON.stringify(notices));
  expect(notices.length, "the buyer is sent the order confirmation").toBe(1);
});

test("3. captain sees the unpaid order and cannot fulfil it yet", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  // Entry from the menu is checked in step 1.
  await p.goto(`${origin(p)}/captain/store`);
  await expect(p.getByRole("heading", { name: "Team store", exact: true })).toBeVisible({ timeout: 60_000 });
  const o = captainOrder(p);
  await expect(o, "the player's order is in the captain's Orders").toBeVisible({ timeout: 30_000 });
  log("captain order (unpaid):", (await o.innerText()).replace(/\s+/g, " "));
  await expect(o).toContainText(JERSEY_TOTAL);
  await expect(o).toContainText(/placed/i);
  await expect(o).toContainText(new RegExp(`Awaiting payment · ${need("invoiceNumber")}`, "i"));
  await expect(o.getByRole("button", { name: "Mark processing" }), "unpaid order cannot be processed").toHaveCount(0);
  await expect(o.getByRole("button", { name: "Cancel order" }), "captain can cancel an unpaid order").toBeVisible();
  await shot(p, "03-captain-unpaid");
});

test("4. player pays the order's invoice on Payments (mock card)", async ({ browser }) => {
  const inv = need("invoiceNumber");
  const p = (await as(browser, "player")).page;
  await p.goto(`${origin(p)}/store`);
  // The store's own pay link, as the player would follow it.
  await playerOrder(p).getByRole("link", { name: `Pay invoice ${inv}` }).click();
  await p.waitForURL(/\/payments$/);

  const card = p
    .locator("main div.rounded-xl")
    .filter({ hasText: inv })
    .filter({ has: p.getByRole("button", { name: `Pay ${JERSEY_TOTAL}` }) })
    .last(); // innermost: the invoice card itself
  await expect(card, "the order's invoice is open on Payments").toBeVisible({ timeout: 60_000 });
  const cardText = (await card.innerText()).replace(/\s+/g, " ");
  log("payments card:", cardText);
  expect.soft(cardText, "a store order's invoice is not labelled as a registration fee").not.toMatch(/registration fee/i);
  await shot(p, "04-payments-open");

  await card.getByRole("button", { name: `Pay ${JERSEY_TOTAL}` }).click();
  const dlg = p.getByRole("dialog", { name: `Pay ${inv}` });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator("select"), "test payment set to succeed").toHaveValue("succeeded");
  const respP = p.waitForResponse((r) => /\/finance\/invoices\/[^/]+\/pay$/.test(r.url()) && r.request().method() === "POST");
  await dlg.getByRole("button", { name: "Pay now" }).click();
  const resp = await respP;
  log("pay →", resp.status(), (await resp.text()).slice(0, 300));
  expect(resp.status()).toBeLessThan(300);
  await expect(p.getByText(`Paid ${JERSEY_TOTAL} to card. Invoice is paid.`)).toBeVisible();
  // Without reload: the invoice moves to history as paid.
  const hist = p.locator("main li").filter({ hasText: inv }).first();
  await expect(hist).toContainText(/paid/i);
  await shot(p, "04b-paid");

  const [row] = await stagingSql<any>(`select status, paid_cents from invoices where id = $1`, [need("invoiceId")]);
  expect(row, "invoice paid in the database").toEqual({ status: "paid", paid_cents: 5900 });
  const pays = await stagingSql<any>(`select amount_cents, status from payments where invoice_id = $1`, [need("invoiceId")]);
  log("db payments:", JSON.stringify(pays));
  expect(pays).toEqual([{ amount_cents: 5900, status: "succeeded" }]);

  // Back on the store, the order reads paid and can no longer be cancelled.
  await p.goto(`${origin(p)}/store`);
  const mine = playerOrder(p);
  await expect(mine).toContainText(/paid/i);
  await expect(mine.getByRole("link", { name: /Pay invoice/ })).toHaveCount(0);
  await expect(mine.getByRole("button", { name: "Cancel order" }), "a paid order is not cancelled here").toHaveCount(0);
});

test("5. captain marks the paid order processing, then shipped with a pickup note", async ({ browser }) => {
  const p = (await as(browser, "teamAdmin")).page;
  await p.goto(`${origin(p)}/captain/store`);
  await expect(p.getByRole("heading", { name: "Team store", exact: true })).toBeVisible({ timeout: 60_000 });
  const o = captainOrder(p);
  await expect(o).toBeVisible({ timeout: 30_000 });
  await expect(o).toContainText(/paid/i);
  await expect(o).not.toContainText(/awaiting payment/i);
  await expect(o.getByRole("button", { name: "Cancel order" }), "a paid order cannot be cancelled by the captain").toHaveCount(0);

  const statusResp = () =>
    p.waitForResponse((r) => /\/captain\/store\/[^/]+\/orders\/[^/]+\/status$/.test(r.url()) && r.request().method() === "POST");
  let respP = statusResp();
  await o.getByRole("button", { name: "Mark processing" }).click();
  let resp = await respP;
  log("mark processing →", resp.status(), (await resp.text()).slice(0, 200));
  expect(resp.status()).toBeLessThan(300);
  // Same card, no reload.
  await expect(o).toContainText(/processing/i);
  await expect(p.getByText(`${BUYER_NAME}'s order is processing. They have been told.`)).toBeVisible();

  await o.getByRole("button", { name: "Mark shipped" }).click();
  await o.getByPlaceholder("e.g. Pick up at Thursday's game").fill(NOTE);
  respP = statusResp();
  await o.getByRole("button", { name: "Mark shipped" }).click();
  resp = await respP;
  log("mark shipped →", resp.status(), (await resp.text()).slice(0, 200));
  expect(resp.status()).toBeLessThan(300);
  await expect(o).toContainText(/shipped/i);
  await expect(o).toContainText(`Note: ${NOTE}`);
  await expect(o.getByRole("button"), "nothing left to do on a shipped order").toHaveCount(0);
  await shot(p, "05-captain-shipped");

  const [row] = await stagingSql<any>(`select status, note, status_changed_at is not null changed from team_store_orders where id = $1`, [
    need("orderId")
  ]);
  expect(row).toEqual({ status: "shipped", note: NOTE, changed: true });
  const notices = await stagingSql<{ idempotency_key: string; status: string; last_error: string | null }>(
    `select idempotency_key, status, last_error from notifications where idempotency_key like $1 order by idempotency_key`,
    [`store.order.status:${need("orderId")}:%`]
  );
  log("status notices:", JSON.stringify(notices));
  expect(notices.map((n) => n.idempotency_key), "the buyer is told at each step").toEqual([
    `store.order.status:${need("orderId")}:processing`,
    `store.order.status:${need("orderId")}:shipped`
  ]);
});

test("6. player sees the order shipped with the captain's note", async ({ browser }) => {
  const p = (await as(browser, "player")).page;
  await p.goto(`${origin(p)}/store`);
  await expect(p.getByRole("heading", { name: `${TEAM_NAME} store` })).toBeVisible({ timeout: 60_000 });
  const mine = playerOrder(p);
  await expect(mine).toBeVisible();
  log("player order (shipped):", (await mine.innerText()).replace(/\s+/g, " "));
  await expect(mine).toContainText(/shipped/i);
  await expect(mine).toContainText(/paid/i);
  await expect(mine).toContainText(`From your captain: ${NOTE}`);
  await shot(p, "06-player-shipped");
});

test("7. cleanup: the order, its invoice and notices, and the products this run generated", async () => {
  const r = run();
  if (r.orderId) {
    await stagingSql(`delete from notifications where idempotency_key like $1`, [`store.order.%:${r.orderId}%`]);
    await stagingSql(`delete from team_store_orders where id = $1`, [r.orderId]); // lines cascade
  }
  if (r.invoiceId) {
    await stagingSql(`delete from notifications where idempotency_key like $1`, [`pay-confirmed-${r.invoiceId}-%`]);
    await stagingSql(`delete from invoices where id = $1`, [r.invoiceId]); // payments and invoice lines cascade
  }
  if (r.createdProductIds?.length) {
    await stagingSql(`delete from team_store_products where id = any($1::uuid[])`, [r.createdProductIds]);
  }
  // Products the pre-MON-15 J16 added by hand ("<tag> Home jersey") and left behind.
  if (r.teamId) {
    const stale = await stagingSql<{ name: string }>(
      `delete from team_store_products where team_id = $1 and name ~ '^E2E[A-Z0-9]+ Home jersey$'
          and not exists (select 1 from team_store_order_items i where i.product_id = team_store_products.id)
        returning name`,
      [r.teamId]
    );
    if (stale.length) log("removed earlier J16 products:", JSON.stringify(stale));
  }
  const [left] = await stagingSql<any>(
    `select (select count(*)::int from team_store_orders where id = $1) orders,
            (select count(*)::int from invoices where id = $2) invoices,
            (select count(*)::int from payments where invoice_id = $2) payments,
            (select count(*)::int from team_store_products where id = any($3::uuid[])) products`,
    [r.orderId ?? null, r.invoiceId ?? null, r.createdProductIds ?? []]
  );
  log("left after cleanup:", JSON.stringify(left));
  expect(left).toEqual({ orders: 0, invoices: 0, payments: 0, products: 0 });
});
