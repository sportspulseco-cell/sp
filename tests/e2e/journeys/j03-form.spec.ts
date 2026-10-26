import { test, expect, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH, OUTPUT_DIR } from "../../../playwright.config";
import { IS_STAGING, RUN_TAG, stagingSql as rawSql, watchErrors } from "./_helpers";

/**
 * J3 · Build and publish a registration form (UC-01, UC-27).
 *
 * org_admin @ org-admin-web walks the whole path a PPHL admin takes:
 *   /org-setup (new league + season + division, all tagged RUN_TAG)
 *   → /forms → New form → every builder tab → publish
 *   → /seasons/[id] flips the season to registration_open
 *   → pricing tier turns active → "Live wizard" opens the funnel.
 * super_admin @ superadmin-web /forms then opens the same form to
 * check the god-app parity rule.
 *
 * Writes `${OUTPUT_DIR}-state/registration-j03.json` so J4/J5 (which
 * need a published, open season) can run against what J3 built.
 */

export const J3_STATE_PATH = `${OUTPUT_DIR}-state/registration-j03.json`;
const SHOTS = `${OUTPUT_DIR}/j03`;

/** PPHL admins are US-based; emulate their clock so date math is realistic. */
async function signedIn(browser: Browser, app: string, email: string, password?: string) {
  const context = await browser.newContext({
    ...(IS_STAGING && existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {}),
    timezoneId: "America/New_York"
  });
  const page = await context.newPage();
  await signIn(page, app, email, password);
  return { context, page };
}

/** Org-setup / builder fields use a sibling <label> (no htmlFor), so find by label text. */
function field(page: Page, label: RegExp) {
  return page
    .locator("div")
    .filter({ has: page.locator(":scope > label", { hasText: label }) })
    .locator("input,select,textarea")
    .first();
}

/** Read-only readback; the pooled connection can be reset while idle, so retry once. */
export async function stagingSql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  try {
    return await rawSql<T>(q, p);
  } catch (e) {
    if (!/ECONNRESET|terminated|CONNECTION_ENDED|CONNECTION_CLOSED/i.test(String(e))) throw e;
    return await rawSql<T>(q, p);
  }
}

/** Sidebar links can sit inside a collapsed group (e.g. "Operations"); expand it like a user would. */
export async function openNav(page: Page, name: RegExp) {
  const link = page.locator("nav").getByRole("link", { name }).first();
  if (!(await link.isVisible().catch(() => false))) {
    // Only closed groups: clicking an open group's summary would close it.
    const groups = page.locator("nav details:not([open]) > summary, nav button[aria-expanded=false]");
    // Opening a group removes it from the closed list, so walk by position
    // over a snapshot of the count and skip ones that are not visible.
    const n = await groups.count();
    for (let i = 0, k = 0; i < n && k < (await groups.count()); i++) {
      const g = groups.nth(k);
      if (!(await g.isVisible().catch(() => false))) { k++; continue; }
      await g.click();
      if (await link.isVisible().catch(() => false)) break;
    }
  }
  await link.click();
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Findings that should not stop the journey (the chain keeps walking so
 * later steps are still exercised). All of them fail the final test.
 */
const findings: string[] = [];
function softExpect(actual: unknown, message: string, negate = false): any {
  return new Proxy({} as any, {
    get: (_t, method: string) => method === "not" ? softExpect(actual, message, true) : (...args: unknown[]) => {
      try {
        const e = expect(actual, message) as any;
        (negate ? e.not : e)[method](...args);
      } catch (e) {
        findings.push(`${message}: ${(e as Error).message.replace(/\[\d+m/g, "").split(String.fromCharCode(10)).filter(Boolean).slice(0, 4).join(" | ")}`);
      }
    }
  });
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.describe.serial("J3 · build and publish a registration form", () => {
  test.skip(!IS_STAGING, "journeys mutate data — staging only");
  test.setTimeout(180_000);

  let oa: Page;
  const errors: string[] = [];
  const state: Record<string, string> = { runTag: RUN_TAG };
  const leagueName = `${RUN_TAG} League`;
  const seasonName = `${RUN_TAG} Season`;
  const divisionName = `${RUN_TAG} Div A`;
  const formName = `${RUN_TAG} Registration`;
  // Dates are typed into an America/New_York browser, so "today" is ET's today.
  const etToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // The API validates dates against the server's UTC date, so between 8pm
  // and midnight ET "today" is refused (see REG bug log). Use the later of
  // ET today and UTC today so the journey can proceed.
  const utcToday = new Date().toISOString().slice(0, 10);
  const today = new Date(`${utcToday > etToday ? utcToday : etToday}T12:00:00`);
  const opens = ymd(today);
  const closes = ymd(new Date(today.getTime() + 21 * 86400_000));
  const start = ymd(new Date(today.getTime() + 30 * 86400_000));
  const end = ymd(new Date(today.getTime() + 180 * 86400_000));

  /**
   * Debug aid: J3_FROM=<n> with E2E_RUN_TAG=<previous runTag> resumes a
   * previous run from step n (earlier steps are skipped, state reloaded).
   */
  const FROM = Number(process.env.J3_FROM ?? 1);
  if (FROM > 1 && existsSync(J3_STATE_PATH)) Object.assign(state, JSON.parse(readFileSync(J3_STATE_PATH, "utf8")));

  test.beforeAll(async ({ browser }) => {
    ({ page: oa } = await signedIn(browser, E2E_URLS.orgAdmin, SMOKE_USERS.orgAdmin));
    errors.push(...[]);
    const errs = watchErrors(oa);
    oa.on("response", (r) => {
      if (r.status() >= 500) errs.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
    });
    (state as any).__errs = errs;
  });

  test.afterAll(async () => {
    const errs: string[] = (state as any).__errs ?? [];
    delete (state as any).__errs;
    mkdirSync(dirname(J3_STATE_PATH), { recursive: true });
    writeFileSync(J3_STATE_PATH, JSON.stringify(state, null, 2));
    writeFileSync(`${OUTPUT_DIR}/j03-errors.txt`, errs.join("\n"));
    await oa?.context().close();
  });

  test("1 · org_admin creates league + season + division in Org setup", async () => {
    test.skip(FROM > 1, "resumed run");
    await oa.goto(`${E2E_URLS.orgAdmin}/`);
    // Entry point discoverable from the sidebar ("Set up a season", the
    // SportsEngine-style name for org setup).
    await openNav(oa, /^Set up a season$/);
    await oa.getByRole("button", { name: /next: league/i }).click();

    const sport = oa.locator("main select").first();
    // Defaults must reflect context: a hockey org should not default to the
    // alphabetically-first sport. (Logged, not blocking: J1 owns org-setup.)
    softExpect(await sport.locator("option:checked").innerText(), "sport default for a hockey org").toMatch(/hockey/i);
    await field(oa, /^League name/).fill(leagueName);
    await sport.selectOption({ label: "Ice Hockey" });
    await oa.getByRole("button", { name: /next: season/i }).click();

    await field(oa, /^Season name/).fill(seasonName);
    await field(oa, /^Season start date/).fill(start);
    await field(oa, /^Season end date/).fill(end);
    await field(oa, /^Registration opens/).fill(opens);
    await field(oa, /^Registration closes/).fill(closes);
    await oa.getByRole("button", { name: /next: divisions/i }).click();

    await field(oa, /^Division name/).fill(divisionName);
    await oa.getByRole("button", { name: /publish league/i }).click();
    await oa.waitForURL((u) => !u.pathname.startsWith("/org-setup"), { timeout: 45_000 });

    const rows = await stagingSql<{ season_id: string; division_id: string; status: string; league_id: string }>(
      `select s.id season_id, d.id division_id, s.status, l.id league_id
         from seasons s join leagues l on l.id = s.league_id
         left join divisions d on d.season_id = s.id
        where s.name = $1`,
      [seasonName]
    );
    expect(rows.length, "season row created (db-row)").toBe(1);
    state.seasonId = rows[0]!.season_id;
    state.divisionId = rows[0]!.division_id;
    state.leagueId = rows[0]!.league_id;
    state.seasonName = seasonName;
    state.divisionName = divisionName;
    expect(rows[0]!.status).toBe("draft");
  });

  test("2 · New form dialog — season registration form for the org", async () => {
    test.skip(FROM > 2, "resumed run");
    await oa.goto(`${E2E_URLS.orgAdmin}/`);
    await openNav(oa, /^Registration forms$/);
    await expect(oa.getByRole("heading", { name: /Registration forms/i })).toBeVisible();
    await oa.getByRole("button", { name: /new form/i }).first().click();
    const dlg = oa.getByRole("dialog");
    await expect(dlg).toBeVisible();

    // Purpose is an enum → dropdown; default must be season registration on this page.
    const purpose = dlg.getByLabel("Purpose", { exact: true });
    expect(await purpose.inputValue()).toBe("season_registration");
    // An org_admin should not be offered "Super Admin" as an audience role.
    softExpect(await dlg.getByText(/^Super Admin$/).count(), "org_admin offered Super Admin as applies-to role")
      .toBe(0);
    // A season-registration form is bound to a season at creation
    // (REG-20): league, then season, picked from dropdowns in the dialog.
    await dlg.getByLabel("League", { exact: true }).selectOption(state.leagueId!);
    const seasonPick = dlg.getByLabel("Season", { exact: true });
    await expect(seasonPick.locator("option", { hasText: seasonName })).toHaveCount(1, { timeout: 20_000 });
    softExpect(await dlg.locator("select option", { hasText: seasonName }).count(), "season picker in New form dialog")
      .toBeGreaterThan(0);
    await seasonPick.selectOption(state.seasonId!);

    await dlg.locator("input:not([type=checkbox])").first().fill(formName);
    await shot(oa, "02-new-form-dialog");
    await dlg.getByRole("button", { name: /create form/i }).click();
    await oa.waitForURL(/\/forms\/[0-9a-f-]{36}/, { timeout: 30_000 });
    state.formId = oa.url().match(/\/forms\/([0-9a-f-]{36})/)![1]!;
    state.formName = formName;
    await expect(oa.getByText(formName).first()).toBeVisible();
  });

  test("3 · Season setup — pick the new season from a dropdown and bind it", async () => {
    test.skip(FROM > 3, "resumed run");
    const seasonSelect = oa.locator("main select").first();
    await expect(seasonSelect).toBeVisible();
    expect(await seasonSelect.evaluate((e) => e.tagName)).toBe("SELECT");
    await expect(oa.getByText(/Loading seasons/)).toHaveCount(0, { timeout: 20_000 });
    await expect(seasonSelect.locator("option", { hasText: seasonName })).toHaveCount(1, { timeout: 20_000 });
    const label = (await seasonSelect.locator("option").allInnerTexts()).find((o) => o.includes(seasonName));
    expect(label, "new season listed in the season dropdown").toBeTruthy();
    // The New form dialog already bound the season (REG-20). Bind it here
    // only when it is not shown as the form's season.
    const boundAtCreate = (await seasonSelect.inputValue()) === state.seasonId;
    state.seasonBoundAtCreate = String(boundAtCreate);
    if (!boundAtCreate) {
      await seasonSelect.selectOption({ label: label! });
      await expect(oa.getByText("Saved.")).toBeVisible({ timeout: 20_000 });
    }

    // Registration type (REG-14): individual, so the funnel offers the player
    // paths J4/J5 walk and not "Register a team". Saved on the season
    // (seasons.config.registrationType), which the funnel and API read.
    const regType = oa.getByLabel("Registration type");
    expect(await regType.locator("option").allInnerTexts()).toEqual([
      "Team registration (captain-led)",
      "Individual registration",
      "Team + individual (mixed)"
    ]);
    await regType.selectOption("individual");
    const saveBtn = oa.getByRole("button", { name: /^save$/i });
    await expect(saveBtn).toBeEnabled({ timeout: 20_000 });
    const saveResp = oa.waitForResponse((r) => /\/seasons\/[0-9a-f-]{36}\/config$/.test(r.url()) && r.request().method() === "PATCH", { timeout: 20_000 }).catch(() => null);
    await saveBtn.click();
    const resp = await saveResp;
    state.registrationTypeSaveHttp = resp ? String(resp.status()) : "no PATCH sent";
    await expect(oa.getByText("Saved.")).toBeVisible({ timeout: 20_000 });
    const [f] = await stagingSql<{ season_id: string }>(
      "select season_id from registration_forms where id = $1",
      [state.formId]
    );
    expect(f!.season_id).toBe(state.seasonId);
    const [cfg] = await stagingSql<{ t: string | null }>(
      "select config->>'registrationType' t from seasons where id = $1",
      [state.seasonId]
    );
    state.registrationTypeStored = String(cfg!.t);
    expect(cfg!.t, `registration type stored on the season (PATCH ${state.registrationTypeSaveHttp})`).toBe("individual");
    // Reload: the dropdown must show what was saved.
    await oa.reload();
    await expect(oa.getByText(/Loading seasons/)).toHaveCount(0, { timeout: 20_000 });
    expect(await oa.getByLabel("Registration type").inputValue(), "registration type after reload").toBe("individual");
  });

  test("4 · Pricing — create a tier with a payment plan", async () => {
    test.skip(FROM > 4, "resumed run");
    await oa.locator("main").getByRole("link", { name: /Pricing/ }).first().click();
    await oa.waitForURL(/section=pricing/);
    await oa.getByRole("button", { name: /new tier/i }).click();
    const card = oa.locator("main li").filter({ has: oa.locator("text=/Full price/i") }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });

    const nameInput = card.locator("input").first();
    await nameInput.fill(`${RUN_TAG} Adult`);
    await nameInput.blur();
    // REG-19: money is typed in dollars ("150" is $150), stored in cents.
    const priceLabel = await card.locator("label", { hasText: /Full price/i }).innerText();
    softExpect(priceLabel, "price field label asks admin for cents").not.toMatch(/cents/i);
    const num = (re: RegExp) => card.locator("label", { hasText: re }).locator("input");
    await num(/Full price/i).fill("150");
    await num(/Full price/i).blur();
    await num(/Deposit/i).fill("50");
    await num(/Deposit/i).blur();
    await num(/Installments/i).fill("2");
    await num(/Installments/i).blur();
    await card.locator("div", { hasText: /^Payment plan/ }).getByRole("button").click();
    await expect(card.getByText(/Payment timeline/i)).toBeVisible();
    // FR-3.1.6: a late fee on the price, copied to each registration invoice
    // and added once by the overdue sweep (0060).
    await num(/Late fee/i).fill("25");
    await num(/Late fee/i).blur();
    await expect.poll(async () => JSON.stringify(await stagingSql("select late_fee_cents from pricing_tiers where season_id = $1", [state.seasonId])), { timeout: 30_000 }).toContain(`"late_fee_cents":2500`);
    await shot(oa, "04-pricing");
    // Early-bird pricing / installment dates are not offered at all.
    // Early-bird (date-based) prices are not in PPHL's requirements or use
    // cases (late fees are, FR-3.1.6); noted, not a finding.
    console.log(`[J3] early-bird option on the tier card: ${await card.getByText(/early/i).count()}`);

    await expect.poll(async () => JSON.stringify(await stagingSql("select full_price_cents, deposit_cents, installment_count, payment_plan_enabled from pricing_tiers where season_id = $1", [state.seasonId])), { timeout: 30_000 }).toContain(`"deposit_cents":5000,"installment_count":2,"payment_plan_enabled":true`);
    const tiers = await stagingSql<{ id: string; full_price_cents: number; deposit_cents: number; installment_count: number; payment_plan_enabled: boolean; is_active: boolean; name: string }>(
      "select id, name, full_price_cents, deposit_cents, installment_count, payment_plan_enabled, is_active from pricing_tiers where season_id = $1",
      [state.seasonId]
    );
    expect(tiers.length).toBe(1);
    expect(tiers[0]).toMatchObject({ full_price_cents: 15000, deposit_cents: 5000, installment_count: 2, payment_plan_enabled: true, is_active: false });
    state.tierId = tiers[0]!.id;
  });

  test("5 · Divisions — assign division to tier, save eligibility rules", async () => {
    test.skip(FROM > 5, "resumed run");
    await oa.locator("main").getByRole("link", { name: /Divisions/ }).first().click();
    await oa.waitForURL(/section=divisions/);
    await expect(oa.getByText(/1 division has no pricing tier assigned/i)).toBeVisible();
    const box = oa.locator("main label", { hasText: divisionName }).locator("input[type=checkbox]");
    await box.check();
    await expect(oa.getByText(/no pricing tier assigned/i)).toHaveCount(0, { timeout: 20_000 });

    // Eligibility toggles: free agent ON (UI default), parental consent ON.
    await oa.getByRole("button", { name: /save eligibility rules/i }).click();
    await oa.waitForTimeout(2500);
    await shot(oa, "05-divisions");
    await expect.poll(async () => JSON.stringify((await stagingSql<{ config: unknown }>("select config from seasons where id = $1", [state.seasonId]))[0]?.config ?? {}), { message: "season.config saved", timeout: 30_000 }).toContain(`"parentalConsentRequired":true`);
    await expect.poll(async () => (await stagingSql("select 1 from pricing_tier_divisions where pricing_tier_id = $1", [state.tierId])).length, { message: "pricing_tier_divisions row", timeout: 30_000 }).toBe(1);
  });

  test("6 · Form builder — add a question, waivers, publish the version", async () => {
    test.skip(FROM > 6, "resumed run");
    if (FROM === 6) await oa.goto(`${E2E_URLS.orgAdmin}/forms/${state.formId}?section=season`);
    await oa.locator("main").getByRole("link", { name: /Form builder/ }).first().click();
    await oa.waitForURL(/section=form_builder/);
    await oa.getByRole("button", { name: /add your first question|add question/i }).first().click();
    await oa.getByRole("button", { name: /Untitled question/ }).first().click();
    const labelInput = oa.locator("main").getByLabel(/^Label$/).first();
    await labelInput.fill("Preferred jersey number");
    await labelInput.blur();
    // Question type is an enum -> dropdown.
    expect(await oa.locator("main").getByLabel(/^Type$/).first().evaluate((e) => e.tagName)).toBe("SELECT");
    // The waiver text edited here is shadowed by Divisions > eligibility (season.config wins in the funnel).
    await expect(oa.getByText(/Waivers & documents/i)).toBeVisible();
    await oa.waitForTimeout(2500); // debounced autosave
    const publish = oa.getByRole("button", { name: /^publish$/i }).last();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(oa.getByText(/Published\. This is now the live version/i)).toBeVisible({ timeout: 20_000 });
    await shot(oa, "06-form-builder");
    const versions = await stagingSql<{ id: string; locked: boolean }>(
      "select id, locked from registration_form_versions where form_id = $1 order by created_at",
      [state.formId]
    );
    // Autosave inserts a new version row every debounce; publish inserts one more.
    softExpect(versions.length, "form versions created by one edit session").toBeLessThanOrEqual(2);
    state.formVersionCount = String(versions.length);
    const [f] = await stagingSql<{ active_version_id: string | null }>("select active_version_id from registration_forms where id = $1", [state.formId]);
    expect(f!.active_version_id).toBeTruthy();
  });

  test("7 · Email templates — add an Approved template and activate it", async () => {
    test.skip(FROM > 7, "resumed run");
    await oa.locator("main").getByRole("link", { name: /Email templates/ }).first().click();
    await oa.waitForURL(/section=email_templates/);
    await oa.getByRole("button", { name: /^approved$/i }).click();
    const toggle = oa.getByRole("button", { name: /^inactive$/i }).first();
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await toggle.click();
    await expect(oa.getByRole("button", { name: /^active$/i }).first()).toBeVisible({ timeout: 20_000 });
    await shot(oa, "07-email");
  });

  test("8 · Review & publish — summary, links, publish", async () => {
    test.skip(FROM > 8, "resumed run");
    await oa.locator("main").getByRole("link", { name: /Review & publish/ }).first().click();
    await oa.waitForURL(/section=review/);
    const main = oa.locator("main");
    await expect(main.getByText(/issues? to resolve before publishing/i)).toHaveCount(0);
    // Registration window shown must match what the admin typed (opens / closes).
    const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const windowTile = main.locator("div", { has: oa.locator("p", { hasText: /^Registration window$/i }) }).last();
    softExpect(await windowTile.innerText(), "review registration window").toContain(`${fmt(opens)} – ${fmt(closes)}`);
    // Registration links (REG-13): this environment's player funnel, never a marketing domain.
    const reviewText = await main.innerText();
    expect(reviewText, "registration link").toContain(`${E2E_URLS.player}/register/${state.seasonId}`);
    expect(reviewText, "no hard-coded marketing domain").not.toMatch(/powerplayhockeyleague/);
    // REG-14: the summary reads the season's registration type.
    expect(reviewText).toContain("Individual registration");
    await shot(oa, "08-review");

    const publishBtn = main.getByRole("button", { name: /publish registration/i });
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();
    // After the Form builder already published, Review has no draft left to publish.
    const msg = main.locator("text=/Published\\.|No draft version to publish/");
    await expect(msg.first()).toBeVisible({ timeout: 20_000 });
    state.reviewPublishMessage = await msg.first().innerText();
    softExpect(state.reviewPublishMessage, "Review publish after form-builder publish").toBe("Published.");
    await shot(oa, "08-review-after-publish");
  });

  test("9 · Season → registration_open from the season page; tier becomes active", async () => {
    test.skip(FROM > 9, "resumed run");
    // Publishing a form does NOT open the season: check, then open it from /seasons.
    const [before] = await stagingSql<{ status: string }>("select status from seasons where id = $1", [state.seasonId]);
    state.statusAfterPublish = before!.status;
    await openNav(oa, /^Seasons$/);
    await oa.getByRole("link", { name: seasonName }).first().click();
    await oa.waitForURL(/\/seasons\/[0-9a-f-]{36}/);
    await oa.getByRole("button", { name: /^draft$/i }).first().click();
    await oa.getByRole("button", { name: /Registration open/ }).click();
    await expect(oa.getByRole("button", { name: /registration open/i }).first()).toBeVisible({ timeout: 20_000 });
    await shot(oa, "09-season-open");
    await expect.poll(async () => (await stagingSql<{ status: string }>("select status from seasons where id = $1", [state.seasonId]))[0]?.status, { timeout: 30_000 }).toBe("registration_open");
    const [tier] = await stagingSql<{ is_active: boolean }>("select is_active from pricing_tiers where id = $1", [state.tierId]);
    expect(tier!.is_active, "pricing tier active after registration_open").toBe(true);
  });

  test("10 · Live wizard opens the player funnel on the same environment", async () => {
    test.skip(FROM > 10, "resumed run");
    await oa.goto(`${E2E_URLS.orgAdmin}/forms/${state.formId}?section=review`);
    const live = oa.getByRole("link", { name: /live wizard/i });
    await expect(live).toBeVisible();
    const href = (await live.getAttribute("href")) ?? "";
    state.liveWizardHref = href;
    // REG-12: built from the API's PLAYER_WEB_URL, no production fallback.
    expect(href, "OA Live wizard must target this environment's player app").toBe(`${E2E_URLS.player}/register/${state.seasonId}`);
    // Admin preview of the player form ("Preview" button) should show the form, not the Review tab.
    const preview = oa.getByRole("link", { name: /^preview$/i });
    softExpect(await preview.getAttribute("href"), "Preview shows the player form").not.toMatch(/section=review/);
  });

  test("11 · super_admin @ superadmin-web /forms sees the same form (god-app parity)", async ({ browser }) => {
    test.skip(FROM > 11, "resumed run");
    const { context, page } = await signedIn(browser, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
    const errs = watchErrors(page);
    await openNav(page, /^Registration forms$/);
    await expect(page.getByRole("link", { name: formName })).toBeVisible({ timeout: 20_000 });
    // OA list shows the season column; SA list does not — note divergence.
    const saHeaders = await page.locator("main thead th").allInnerTexts();
    state.saFormsColumns = saHeaders.join("|");
    await page.getByRole("link", { name: formName }).click();
    await expect(page.getByText(seasonName).first()).toBeVisible();
    for (const s of ["pricing", "divisions", "form_builder", "email_templates", "review"]) {
      await page.goto(`${E2E_URLS.superadmin}/forms/${state.formId}?section=${s}`);
      await expect(page.locator("body")).not.toContainText(/Application error|Something went wrong/i);
    }
    await shot(page, "11-sa-review");
    const href = await page.getByRole("link", { name: /live wizard/i }).getAttribute("href");
    state.saLiveWizardHref = href ?? "";
    expect(href, "SA Live wizard targets this environment's player app").toBe(`${E2E_URLS.player}/register/${state.seasonId}`);
    softExpect(errs.filter((e) => /http 5\d\d/.test(e)), "5xx on SA form pages").toEqual([]);
    await context.close();
  });

  test("12 · findings logged along the way", async () => {
    writeFileSync(`${OUTPUT_DIR}/j03-findings.txt`, findings.join(String.fromCharCode(10)));
    expect(findings, "soft findings (see doc/testing/bugs/registration.md)").toEqual([]);
  });
});
