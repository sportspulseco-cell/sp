import { test, expect, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH, OUTPUT_DIR } from "../../../playwright.config";
import { IS_STAGING, RUN_TAG, stagingSql as rawSql, watchErrors } from "./_helpers";

/**
 * J4 · Player registers and pays (UC-01, UC-27).
 *
 * Needs J3 (a published form on an open RUN_TAG season). Reads the
 * state file J3 writes; when it is missing the journey is BLOCKED.
 *
 *   anonymous visitor @ player-web /register  → can they find the season?
 *   new player @ /register/[seasonId] funnel  → path, account, details,
 *       compliance (waivers), payment option, pay  (stepper order checked)
 *   same player signs in @ player-web         → /registrations, /payments
 *   org_admin @ org-admin-web /registrations  → row appears, approve
 *   super_admin @ superadmin-web /registrations → row appears
 *   player                                     → sees "approved"
 *   unhappy: returning-user sign-in without password, existing email in
 *   "Create account" with a wrong password, duplicate submission,
 *   wrong-org discovery.
 */

const J3_STATE = `${OUTPUT_DIR}-state/registration-j03.json`;
const SHOTS = `${OUTPUT_DIR}/j04`;
const PASSWORD = "E2e!Pass-2026x";

async function stagingSql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  try {
    return await rawSql<T>(q, p);
  } catch (e) {
    if (!/ECONNRESET|terminated|CONNECTION_ENDED|CONNECTION_CLOSED/i.test(String(e))) throw e;
    return await rawSql<T>(q, p);
  }
}

async function newCtx(browser: Browser) {
  return browser.newContext({
    ...(IS_STAGING && existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {}),
    timezoneId: "America/New_York"
  });
}

async function signedIn(browser: Browser, app: string, email: string, password?: string) {
  const context = await newCtx(browser);
  const page = await context.newPage();
  await signIn(page, app, email, password);
  return { context, page };
}

const findings: string[] = [];
function softExpect(actual: unknown, message: string, negate = false): any {
  return new Proxy({} as any, {
    get: (_t, method: string) =>
      method === "not"
        ? softExpect(actual, message, true)
        : (...args: unknown[]) => {
            try {
              const e = expect(actual, message) as any;
              (negate ? e.not : e)[method](...args);
            } catch (e) {
              findings.push(
                `${message}: ${(e as Error).message.replace(/\u001b\[\d+m/g, "").split(String.fromCharCode(10)).filter(Boolean).slice(0, 4).join(" | ")}`
              );
            }
          }
  });
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Label of the highlighted phase in the funnel's 6-step stepper. */
async function activePhase(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dot = document.querySelector("ol span.bg-accent");
    return (dot?.parentElement as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? "?";
  });
}

/** Sidebar links may sit inside a collapsed <details> group. */
async function openNavLink(page: Page, name: RegExp) {
  const link = page.locator("nav").getByRole("link", { name }).first();
  if (!(await link.isVisible().catch(() => false))) {
    const groups = page.locator("nav summary");
    for (let i = 0; i < (await groups.count()); i++) {
      await groups.nth(i).click().catch(() => {});
      if (await link.isVisible().catch(() => false)) break;
    }
  }
  await link.click();
}

/** Funnel field by its visible label (ui Field associates label+input when the input is the direct child). */
function byLabel(page: Page, label: RegExp) {
  return page.getByLabel(label).first();
}

test.describe.serial("J4 · player registers and pays", () => {
  test.skip(!IS_STAGING, "journeys mutate data — staging only");
  test.setTimeout(240_000);

  let j3: Record<string, string> = {};
  let email = `staging-e2e+${RUN_TAG.toLowerCase()}-adult@sportspulse.us`;
  let first = "Ada";
  let last = `${RUN_TAG}Adult`;
  let fullName = `${first} ${last}`;
  const phases: string[] = [];
  let player: Page;
  let submissionId = "";
  let approvedBy = "";
  let oaQueueHeader = "";
  /** API base the funnel itself calls, captured from its network traffic. */
  let apiBase = "";

  /** Debug aid: J4_FROM=<n> resumes the previous run's player from step n. */
  const FROM = Number(process.env.J4_FROM ?? 0);
  const J4_STATE = `${OUTPUT_DIR}-state/registration-j04.json`;

  test.beforeAll(() => {
    if (!existsSync(J3_STATE)) return;
    j3 = JSON.parse(readFileSync(J3_STATE, "utf8"));
    if (FROM > 0 && existsSync(J4_STATE)) {
      const prev = JSON.parse(readFileSync(J4_STATE, "utf8"));
      submissionId = prev.submissionId;
      email = prev.email;
      last = prev.last;
      first = prev.first;
      fullName = `${first} ${last}`;
      approvedBy = prev.approvedBy ?? "";
    }
  });

  test.afterAll(async () => {
    writeFileSync(`${OUTPUT_DIR}/j04-findings.txt`, findings.join(String.fromCharCode(10)));
    const st = JSON.stringify({ email, first, last, submissionId, phases, approvedBy, oaQueueHeader }, null, 2);
    writeFileSync(`${OUTPUT_DIR}/j04-state.json`, st);
    if (FROM === 0) writeFileSync(J4_STATE, st);
    writeFileSync(`${OUTPUT_DIR}/j04-http-errors.txt`, (((player as any)?.__errs ?? []) as string[]).join(String.fromCharCode(10)));
    await player?.context().close();
  });

  test("0 · J3 produced an open season with a published form", async () => {
    test.skip(!j3.seasonId, "BLOCKED: J3 state file missing — run j03-form.spec.ts first");
    const [s] = await stagingSql<{ status: string }>("select status from seasons where id = $1", [j3.seasonId]);
    expect(s!.status).toBe("registration_open");
  });

  test("1 · anonymous visitor finds the open season on /register", async ({ browser }) => {
    test.skip(FROM > 1, "resumed run");
    test.skip(!j3.seasonId, "BLOCKED: no J3 season");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    const errs = watchErrors(page);
    await page.goto(`${E2E_URLS.player}/register`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "01-anon-register");
    // /register lists open seasons for the signed-in player's own orgs; it is
    // not an anonymous directory of every org's seasons (a signed-in player
    // once saw other orgs' seasons there). Anonymous players arrive by the
    // season's own link, which the league shares.
    softExpect(new URL(page.url()).pathname, "anonymous /register asks the visitor to sign in").toBe("/sign-in");
    await page.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
    await expect(page.getByRole("button", { name: /Register as a player/i })).toBeVisible({ timeout: 30_000 });
    softExpect(errs.filter((e) => /http 5/.test(e)), "5xx on anonymous /register").toEqual([]);
    await ctx.close();
  });

  test("2 · signed-in player (staging org) discovers the season on /register and home", async ({ browser }) => {
    test.skip(FROM > 2, "resumed run");
    test.skip(!j3.seasonId, "BLOCKED: no J3 season");
    const { context, page } = await signedIn(browser, E2E_URLS.player, SMOKE_USERS.player);
    await page.goto(`${E2E_URLS.player}/`);
    await shot(page, "02-player-home");
    const [win] = await stagingSql<{ opens: Date }>("select registration_opens_at opens from seasons where id = $1", [j3.seasonId]);
    const openNow = new Date(win!.opens) <= new Date();
    test.info().annotations.push({ type: "season-window", description: `registration_opens_at=${new Date(win!.opens).toISOString()} openNow=${openNow}` });
    // The home card previews three open seasons and links to all of them;
    // staging has many test seasons, so this one may sit behind "See all".
    const card = page.getByText(/accepting registrations/i);
    softExpect(await card.count(), `player home shows the open registrations card (openNow=${openNow})`).toBeGreaterThan(0);
    await page.goto(`${E2E_URLS.player}/register`);
    await expect(page.getByRole("heading", { name: /find a team/i })).toBeVisible();
    await shot(page, "02-player-register");
    softExpect(await page.getByText(j3.seasonName!).count(), `signed-in player sees RUN_TAG season on /register (openNow=${openNow})`).toBeGreaterThan(0);
    await context.close();
  });

  test("3 · new player walks the funnel: path → account", async ({ browser }) => {
    test.skip(FROM > 3, "resumed run");
    test.skip(!j3.seasonId, "BLOCKED: no J3 season");
    const ctx = await newCtx(browser);
    player = await ctx.newPage();
    const errs = watchErrors(player);
    (player as any).__errs = errs;
    player.on("request", (r) => {
      const i = r.url().indexOf("/public/registration/");
      if (i > 0 && !apiBase) apiBase = r.url().slice(0, i);
    });
    // REG-16: outside the window the funnel shows the server's sentence,
    // not the form, and the API refuses to create a registration.
    const [win] = await stagingSql<{ open: boolean; opens: Date | null }>(
      "select (registration_opens_at <= now() and registration_closes_at >= now()) open, registration_opens_at opens from seasons where id = $1",
      [j3.seasonId]
    );
    await player.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
    if (!win?.open) {
      await expect(player.getByRole("heading", { name: /Registration is not open yet|Registration is closed/ })).toBeVisible({ timeout: 30_000 });
      await shot(player, "03-window-not-open");
      test.skip(true, `BLOCKED: J3 season window is not open (opens ${win?.opens ? new Date(win.opens).toISOString() : "unset"}); the funnel shows the closed state (REG-16)`);
    }
    await expect(player.locator("ol").first()).toBeVisible({ timeout: 30_000 });
    phases.push(`path:${await activePhase(player)}`);
    await shot(player, "03-path");
    // Path cards — registration type was saved as "team + individual".
    await player.getByRole("button", { name: /Register as a player/i }).click();
    await player.getByRole("button", { name: /^Next/ }).click();

    // Division step only when 2+ divisions; J3 made one.
    phases.push(`account:${await activePhase(player)}`);
    await player.getByRole("tab", { name: /create account/i }).click();
    await byLabel(player, /^First name/).fill(first);
    await byLabel(player, /^Last name/).fill(last);
    await byLabel(player, /^Email address/).fill(email);
    await byLabel(player, /^Date of birth/).fill("1990-05-05");
    await byLabel(player, /^Password/).fill(PASSWORD);
    await byLabel(player, /^Confirm password/).fill(PASSWORD);
    await shot(player, "03-account");
    await player.getByRole("button", { name: /Next: Details/ }).filter({ visible: true }).first().click();
    await expect(player.getByRole("button", { name: /Next: Compliance/ })).toBeVisible({ timeout: 30_000 });
    const rows = await stagingSql<{ id: string; status: string; form_version_id: string }>(
      "select id, status, form_version_id from registrations where season_id = $1 and metadata->>'email' = $2",
      [j3.seasonId, email]
    );
    expect(rows.length, "registration row created at account step (db-row)").toBe(1);
    submissionId = rows[0]!.id;
    expect(rows[0]!.status).toBe("pending_payment");
    // The registration must point at THIS form's version, not an arbitrary one.
    const [fv] = await stagingSql<{ form_id: string }>("select form_id from registration_form_versions where id = $1", [rows[0]!.form_version_id]);
    expect(fv?.form_id, "registrations.form_version_id belongs to the season's form (REG-8)").toBe(j3.formId);
  });

  test("4 · details → compliance (waivers) → payment option", async () => {
    test.skip(FROM > 4, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    phases.push(`details:${await activePhase(player)}`);
    await shot(player, "04-details");
    // Custom question from J3's form builder must render.
    softExpect(await player.getByText("Preferred jersey number").count(), "custom question from form builder renders").toBeGreaterThan(0);
    const usa = player.getByPlaceholder("e.g. 1234567890").first();
    if (await usa.isVisible().catch(() => false)) await usa.fill("ABC12345");
    const level = player.locator("select").filter({ has: player.locator("option", { hasText: /Pick a level/ }) }).first();
    const levels = await level.locator("option").allInnerTexts();
    // REG-21: the funnel offers the same A/B/C/D levels as the division tiers.
    softExpect(levels.join("|"), "funnel skill levels match division skill/tier enum (A,B,C,D)").toContain("D");
    await level.selectOption("B");
    await player.getByRole("button", { name: /^Center$/ }).click().catch(() => {});
    // Availability chips if present
    const avail = player.getByRole("button", { name: /weeknights|weekends|mon|tue|wed|thu|fri|sat|sun/i }).first();
    if (await avail.isVisible().catch(() => false)) await avail.click();
    const jersey = player.getByLabel(/Preferred jersey number/).first();
    if (await jersey.isVisible().catch(() => false)) await jersey.fill("17");
    const next = player.getByRole("button", { name: /Next: Compliance/ });
    if (!(await next.isEnabled())) {
      await shot(player, "04-details-blocked");
      throw new Error("Next: Compliance stays disabled after filling the required details");
    }
    await next.click();

    // Compliance: liability waiver (scroll + typed name), code of conduct.
    await expect(player.getByText(/Automated eligibility checks/i).first()).toBeVisible({ timeout: 30_000 });
    phases.push(`compliance:${await activePhase(player)}`);
    await shot(player, "04-compliance");
    const hasLiability = await player.getByText(/Type your full legal name to sign/i).first().isVisible().catch(() => false);
    // J3 left "Require liability waiver" ON (default) with empty text and saved eligibility rules.
    expect(hasLiability, "required liability waiver is presented for signature (UC-27, REG-5)").toBe(true);
    await expect(player.getByText(/Still to do:.*Liability waiver/)).toBeVisible();
    await expect(player.getByRole("button", { name: /documents to sign/ })).toBeDisabled();
    // Server gate (REG-5): paying before signing is refused and changes nothing.
    expect(apiBase, "API base captured from the funnel's own requests").toBeTruthy();
    const early = await fetch(`${apiBase}/public/registration/submissions/${submissionId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, mockOutcome: "succeeded" })
    });
    const earlyBody = await early.text();
    expect(early.status, `pay before signing is refused (REG-5): ${earlyBody.slice(0, 160)}`).toBe(409);
    expect(earlyBody).toMatch(/Liability waiver/);
    const [still] = await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]);
    expect(still!.status, "registration unchanged after the refused pay (db-row)").toBe("pending_payment");
    {
      const docs = player.locator("div.max-h-48.overflow-y-auto");
      for (let i = 0; i < (await docs.count()); i++) {
        await docs.nth(i).evaluate((el) => {
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event("scroll"));
        });
      }
      const nameInput = player.getByLabel(/Type your full legal name to sign/i).first();
      await nameInput.fill("Someone Else");
      await expect(player.getByRole("button", { name: /^Sign$/ }).first()).toBeDisabled();
      await nameInput.fill(fullName);
      await player.getByRole("button", { name: /^Sign$/ }).first().click();
      await expect(player.getByText(/^Signed$/i).first()).toBeVisible({ timeout: 30_000 });
    }
    await player.getByRole("switch", { name: /Code of conduct/i }).click();
    await shot(player, "04-compliance-signed");
    await player.getByRole("button", { name: /Next: Payment/ }).click();

    // Tier step (one tier) then Review.
    phases.push(`tier:${await activePhase(player)}`);
    await shot(player, "04-tier");
    const tierCard = player.getByText(new RegExp(`${j3.runTag} Adult`)).first();
    await expect(tierCard).toBeVisible({ timeout: 30_000 });
    await tierCard.click();
    await player.getByRole("button", { name: /^Continue/ }).click();
    phases.push(`review:${await activePhase(player)}`);
    await shot(player, "04-review");
    await player.getByRole("button", { name: /Continue to payment/ }).click();
    phases.push(`payment:${await activePhase(player)}`);
    await shot(player, "04-payment");

    const sigs = await stagingSql("select cs.id from consent_signatures cs join registrations r on r.subject_person_id = cs.person_id where r.id = $1", [submissionId]).catch(
      async () => stagingSql("select id from consent_signatures where signed_at > now() - interval '30 minutes'")
    );
    // Liability waiver + code of conduct acknowledgment (REG-5).
    expect(sigs.length, "waiver + code of conduct signatures stored (consent_signatures)").toBeGreaterThanOrEqual(2);
  });

  test("5 · pay with the payment plan; stepper order matches runtime order", async () => {
    test.skip(FROM > 5, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    // Player-facing mock controls should not exist on a real payment page.
    softExpect(await player.getByRole("button", { name: /Simulate decline/i }).count(), "'Simulate decline' button shown to players").toBe(0);
    const planOpt = player.getByText(/Payment plan — \$50/).first();
    if (await planOpt.isVisible().catch(() => false)) await planOpt.click();
    const payBtn = player.getByRole("button", { name: /^Pay \$/ });
    const payLabel = (await payBtn.innerText()).trim();
    softExpect(payLabel, "plan option charges the deposit today").toMatch(/\$50/);
    await payBtn.click();
    await expect.poll(() => activePhase(player), { timeout: 60_000, message: "funnel reaches Confirmation after Pay" }).not.toMatch(/PAYMENT/);
    await player.waitForTimeout(1000);
    phases.push(`done:${await activePhase(player)}`);
    await shot(player, "05-done");

    // Stepper: phases must be non-decreasing and visit 1..6 in order.
    const nums = phases.map((p) => Number(p.split(":")[1]!.match(/\d/)?.[0] ?? (p.startsWith("done") ? 6 : NaN)));
    for (let i = 1; i < nums.length; i++) {
      softExpect(nums[i]! >= nums[i - 1]!, `stepper goes backwards at ${phases[i]} (sequence ${phases.join(", ")})`).toBe(true);
    }

    const [r] = await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]);
    expect(r!.status).toBe("pending_review");
    const inv = await stagingSql<{ total_cents: number; paid_cents: number; status: string }>(
      "select total_cents, paid_cents, status from invoices where idempotency_key = $1",
      [`submission:${submissionId}`]
    );
    expect(inv.length, "invoice row (db-row)").toBe(1);
    // Plan: $150 total, $50 deposit today → paid 5000, not 15000; and no real charge happened.
    softExpect(inv[0]!.paid_cents, "plan payment records deposit only").toBe(5000);
    softExpect(inv[0]!.total_cents, "invoice total = tier price").toBe(15000);
    const sched = await stagingSql("select 1 from information_schema.tables where table_name = 'installment_schedules'");
    softExpect(sched.length, "installment schedule table exists for payment plans").toBeGreaterThan(0);
    const errs: string[] = (player as any).__errs ?? [];
    softExpect(errs.filter((e) => /http 5/.test(e)), "5xx during funnel").toEqual([]);
  });

  test("6 · player signs in: /registrations and /payments show it", async ({ browser }) => {
    test.skip(FROM > 6, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    const { context, page } = await signedIn(browser, E2E_URLS.player, email, PASSWORD);
    await page.goto(`${E2E_URLS.player}/registrations`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "06-registrations");
    softExpect(await page.getByText(j3.seasonName!).count(), "player /registrations lists the season").toBeGreaterThan(0);
    await page.goto(`${E2E_URLS.player}/payments`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "06-payments");
    softExpect(await page.getByText(/\$150(\.00)?/).count(), "player /payments shows the $150 invoice").toBeGreaterThan(0);
    await context.close();
  });

  test("7 · org_admin sees the submission in /registrations and approves it", async ({ browser }) => {
    test.skip(FROM > 7, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    const { context, page } = await signedIn(browser, E2E_URLS.orgAdmin, SMOKE_USERS.orgAdmin);
    const errs = watchErrors(page);
    await page.goto(`${E2E_URLS.orgAdmin}/`);
    await openNavLink(page, /^Registrations$/);
    await page.waitForLoadState("networkidle").catch(() => {});
    const row = page.locator("tr", { hasText: email });
    const visible = await row.isVisible({ timeout: 15_000 }).catch(() => false);
    await shot(page, "07-oa-registrations");
    const [cnt] = await stagingSql<{ n: string }>("select count(*) n from registrations where org_id = (select org_id from registrations where id = $1)", [submissionId]);
    oaQueueHeader = (await page.locator("main").innerText()).match(/\d+ PENDING · \d+ TOTAL/i)?.[0] ?? "";
    softExpect(visible, `OA /registrations lists the submission (page says "${oaQueueHeader}", db has ${cnt!.n} rows for the org)`).toBe(true);
    if (visible) {
      // The queue must say WHO registered and for WHICH season, not a person-id prefix.
      softExpect(await row.innerText(), "OA registrations row shows the player's name").toContain(last);
      softExpect(await row.innerText(), "OA registrations row shows the season").toContain(j3.seasonName!);
      const before = await row.locator("td").nth(2).innerText();
      await row.getByRole("button", { name: /approve/i }).click();
      await expect(row.locator("td").nth(2)).not.toHaveText(before, { timeout: 30_000 });
      softExpect((await row.locator("td").nth(2).innerText()).toLowerCase(), "OA row status after approve (no reload)").toContain("approved");
      approvedBy = "org_admin";
    }
    softExpect(errs.filter((e) => /http 5/.test(e)), "OA registrations 5xx").toEqual([]);
    await context.close();
  });

  test("8 · super_admin sees the submission in /registrations (approves it if OA could not)", async ({ browser }) => {
    test.skip(FROM > 8, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    const { context, page } = await signedIn(browser, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
    await page.goto(`${E2E_URLS.superadmin}/`);
    await openNavLink(page, /^Registrations$/);
    await page.waitForLoadState("networkidle").catch(() => {});
    // The review queue defaults to "needs decision"; an approved row is only visible under "All".
    const row = page.locator("tr", { hasText: email });
    if (!approvedBy) {
      await expect(row).toBeVisible({ timeout: 30_000 });
      await shot(page, "08-sa-queue");
      await row.getByRole("button", { name: /^Review$/ }).click();
      const dlg = page.getByRole("dialog");
      await expect(dlg).toBeVisible();
      await shot(page, "08-sa-review-dialog");
      await dlg.getByRole("button", { name: /^Approve$/ }).click();
      await expect(row).toHaveCount(0, { timeout: 30_000 });
      approvedBy = "super_admin";
    } else {
      const sel = page.locator("main select").first();
      await sel.selectOption({ label: "All" }).catch(() => {});
      softExpect(await row.count(), "SA /registrations lists the approved submission").toBeGreaterThan(0);
      await shot(page, "08-sa-registrations");
    }
    await expect.poll(async () => (await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]))[0]?.status, { timeout: 30_000 }).toBe("approved");
    await context.close();
  });

  test("9 · player sees approved status", async ({ browser }) => {
    test.skip(FROM > 9, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    const { context, page } = await signedIn(browser, E2E_URLS.player, email, PASSWORD);
    await page.goto(`${E2E_URLS.player}/registrations`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "09-player-approved");
    softExpect((await page.locator("main").innerText()).toLowerCase(), "player sees approved").toMatch(/approved|active|confirmed/);
    await context.close();
  });

  test("10 · unhappy: 'Sign in' tab resumes another user's registration without a password", async ({ browser }) => {
    test.skip(FROM > 10, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await page.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
    await page.getByRole("button", { name: /Register as a player/i }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("tab", { name: /^sign in$/i }).click();
    await page.getByLabel(/^Email/).first().fill(email);
    await page.getByLabel(/^Password/).first().fill("definitely-not-the-password");
    await page.getByRole("button", { name: /Sign in & continue/i }).click();
    await page.waitForTimeout(5000);
    await shot(page, "10-signin-wrong-password");
    const advanced = await page.getByRole("button", { name: /Next: Compliance/ }).isVisible().catch(() => false);
    // No date field when sign-in is refused; do not wait for one.
    const leakedDob = await page.locator("input[type=date]").first().inputValue({ timeout: 2_000 }).catch(() => "");
    softExpect(advanced, "wrong password still advances to Details (account takeover)").toBe(false);
    softExpect(leakedDob, "stranger sees the player's DOB").not.toBe("1990-05-05");
    await ctx.close();
  });

  test("11 · unhappy: 'Create account' with an existing email and wrong password", async ({ browser }) => {
    test.skip(FROM > 11, "resumed run");
    test.skip(!j3.seasonId, "BLOCKED: no J3 season");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await page.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
    await page.getByRole("button", { name: /Register as a player/i }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("tab", { name: /create account/i }).click();
    await byLabel(page, /^First name/).fill("Staging");
    await byLabel(page, /^Last name/).fill("Player");
    await byLabel(page, /^Email address/).fill(SMOKE_USERS.player);
    await byLabel(page, /^Date of birth/).fill("1992-01-01");
    await byLabel(page, /^Password/).fill(PASSWORD);
    await byLabel(page, /^Confirm password/).fill(PASSWORD);
    await page.getByRole("button", { name: /Next: Details/ }).filter({ visible: true }).first().click();
    await page.waitForTimeout(6000);
    await shot(page, "11-create-existing-email");
    const advanced = await page.getByRole("button", { name: /Next: Compliance/ }).isVisible().catch(() => false);
    softExpect(advanced, "existing email + wrong password creates a registration as that user").toBe(false);
    const rows = await stagingSql("select id from registrations where season_id = $1 and metadata->>'email' = $2", [j3.seasonId, SMOKE_USERS.player]);
    softExpect(rows.length, "registration rows written for staging-player via wrong password").toBe(0);
    await ctx.close();
  });

  test("12 · unhappy: same player registers again (duplicate)", async ({ browser }) => {
    test.skip(FROM > 12, "resumed run");
    test.skip(!submissionId, "BLOCKED: no submission");
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await page.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
    await page.getByRole("button", { name: /Register as a player/i }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("tab", { name: /create account/i }).click();
    await byLabel(page, /^First name/).fill(first);
    await byLabel(page, /^Last name/).fill(last);
    await byLabel(page, /^Email address/).fill(email);
    await byLabel(page, /^Date of birth/).fill("1990-05-05");
    await byLabel(page, /^Password/).fill(PASSWORD);
    await byLabel(page, /^Confirm password/).fill(PASSWORD);
    await page.getByRole("button", { name: /Next: Details/ }).filter({ visible: true }).first().click();
    await page.waitForTimeout(6000);
    await shot(page, "12-duplicate");
    const text = await page.locator("body").innerText();
    softExpect(text, "duplicate registration gets a clear 'already registered' message").toMatch(/already registered|already have a registration|approved/i);
    const rows = await stagingSql("select id, status from registrations where season_id = $1 and metadata->>'email' = $2", [j3.seasonId, email]);
    expect(rows.length, "no second registration row").toBe(1);
    await ctx.close();
  });

  test("13 · findings logged along the way", async () => {
    expect(findings, "soft findings (see doc/testing/bugs/registration.md)").toEqual([]);
  });
});
