import { test, expect, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH, OUTPUT_DIR } from "../../../playwright.config";
import { IS_STAGING, RUN_TAG, stagingSql as rawSql, watchErrors } from "./_helpers";

/**
 * J5 · Minor with parental consent (UC-02, UC-27, UC-28).
 *
 * Needs J3's open season (state file). A NEW user with an under-18 DOB
 * goes through the player-web funnel. The funnel must ask for a
 * guardian, produce a consent link, and hold the registration until the
 * guardian signs at /parental-consent/[token]. No inbox is reachable in
 * this run, so the token is read from (a) what the funnel shows and
 * (b) a read-only staging DB readback — both are recorded.
 *
 * Also checks: org_admin approving BEFORE consent; the minor
 * self-confirming with the token shown to them; what the funnel does
 * after the guardian has already consented in the portal.
 */

const J3_STATE = `${OUTPUT_DIR}-state/registration-j03.json`;
const SHOTS = `${OUTPUT_DIR}/j05`;
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

async function activePhase(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dot = document.querySelector("ol span.bg-accent");
    return (dot?.parentElement as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? "?";
  });
}

test.describe.serial("J5 · minor registers with parental consent", () => {
  test.skip(!IS_STAGING, "journeys mutate data — staging only");
  test.setTimeout(240_000);

  let j3: Record<string, string> = {};
  const email = `staging-e2e+${RUN_TAG.toLowerCase()}-minor@sportspulse.us`;
  const parentEmail = `staging-e2e+${RUN_TAG.toLowerCase()}-parent@sportspulse.us`;
  const first = "Milo";
  const last = `${RUN_TAG}Minor`;
  const fullName = `${first} ${last}`;
  // 14 years old today.
  const now = new Date();
  const dob = `${now.getFullYear() - 14}-03-03`;
  let minor: Page;
  let submissionId = "";
  let token = "";
  let consentUrlShownToMinor = "";
  const phases: string[] = [];

  test.beforeAll(() => {
    if (existsSync(J3_STATE)) j3 = JSON.parse(readFileSync(J3_STATE, "utf8"));
  });

  test.afterAll(async () => {
    writeFileSync(`${OUTPUT_DIR}/j05-findings.txt`, findings.join(String.fromCharCode(10)));
    writeFileSync(`${OUTPUT_DIR}/j05-state.json`, JSON.stringify({ email, parentEmail, submissionId, consentUrlShownToMinor, phases }, null, 2));
    writeFileSync(`${OUTPUT_DIR}/j05-http-errors.txt`, (((minor as any)?.__errs ?? []) as string[]).join(String.fromCharCode(10)));
    await minor?.context().close();
  });

  test("1 · minor creates an account in the funnel; registration lands in pending_consent", async ({ browser }) => {
    test.skip(!j3.seasonId, "BLOCKED: J3 state file missing — run j03-form.spec.ts first");
    const ctx = await newCtx(browser);
    minor = await ctx.newPage();
    (minor as any).__errs = watchErrors(minor);
    await minor.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
    await minor.getByRole("button", { name: /Register as a player/i }).click();
    await minor.getByRole("button", { name: /^Next/ }).click();
    await minor.getByRole("tab", { name: /create account/i }).click();
    await minor.getByLabel(/^First name/).first().fill(first);
    await minor.getByLabel(/^Last name/).first().fill(last);
    await minor.getByLabel(/^Email address/).first().fill(email);
    await minor.getByLabel(/^Date of birth/).first().fill(dob);
    await minor.getByLabel(/^Password/).first().fill(PASSWORD);
    await minor.getByLabel(/^Confirm password/).first().fill(PASSWORD);
    await minor.getByRole("button", { name: /Next: Details/ }).filter({ visible: true }).first().click();
    await expect(minor.getByRole("button", { name: /Next: Waivers/ })).toBeVisible({ timeout: 30_000 });
    const rows = await stagingSql<{ id: string; status: string; minor: string }>(
      "select id, status, metadata->>'isMinor' minor from registrations where season_id = $1 and metadata->>'email' = $2",
      [j3.seasonId, email]
    );
    expect(rows.length).toBe(1);
    submissionId = rows[0]!.id;
    expect(rows[0]!.status, "minor starts in pending_consent").toBe("pending_consent");
  });

  test("2 · org_admin cannot approve before consent", async ({ browser }) => {
    test.skip(!submissionId, "BLOCKED: no submission");
    const context = await newCtx(browser);
    const page = await context.newPage();
    await signIn(page, E2E_URLS.orgAdmin, SMOKE_USERS.orgAdmin);
    await page.goto(`${E2E_URLS.orgAdmin}/registrations`);
    const row = page.locator("tr", { hasText: fullName });
    const visible = await row.isVisible({ timeout: 15_000 }).catch(() => false);
    softExpect(visible, "OA /registrations lists the pending_consent minor").toBe(true);
    const approve = row.getByRole("button", { name: /approve/i });
    const offered = await approve.count();
    softExpect(offered, "OA offers Approve on a pending_consent row").toBe(0);
    if (offered) {
      await approve.click();
      const alert = page.locator("[role=alert], .text-error, [class*=rose]").first();
      await expect(alert).toBeVisible({ timeout: 20_000 }).catch(() => {});
      const msg = (await page.locator("main").innerText()).match(/.*(transition|consent|cannot|invalid).*/i)?.[0] ?? "(no message)";
      writeFileSync(`${OUTPUT_DIR}/j05-approve-before-consent.txt`, msg);
      softExpect(msg, "approve-before-consent error is readable for an admin").not.toMatch(/transition|pending_consent|->/);
    }
    await shot(page, "02-oa-approve-before-consent");
    const [r] = await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]);
    expect(r!.status, "server kept the row in pending_consent").toBe("pending_consent");
    await context.close();
  });

  test("3 · funnel asks for a guardian and produces a consent link", async () => {
    test.skip(!submissionId, "BLOCKED: no submission");
    phases.push(`details:${await activePhase(minor)}`);
    const usa = minor.getByPlaceholder("e.g. 1234567890").first();
    if (await usa.isVisible().catch(() => false)) await usa.fill("MIN12345");
    const level = minor.locator("select").filter({ has: minor.locator("option", { hasText: /Pick a level/ }) }).first();
    await level.selectOption("C");
    await minor.getByRole("button", { name: /^Center$/ }).click().catch(() => {});
    await minor.getByRole("button", { name: /^mon$/i }).click().catch(() => {});
    await minor.getByRole("button", { name: /Next: Waivers/ }).click();
    await expect(minor.getByText(/Parental consent required/i)).toBeVisible({ timeout: 30_000 });
    phases.push(`consent:${await activePhase(minor)}`);
    await minor.getByLabel(/Parent \/ guardian email/i).fill(parentEmail);
    await minor.getByRole("button", { name: /Send consent request/i }).click();
    const msgBox = minor.locator("textarea[readonly]").first();
    await expect(msgBox).toBeVisible({ timeout: 30_000 });
    const body = await msgBox.inputValue();
    consentUrlShownToMinor = body.match(/https?:\/\/\S+\/parental-consent\/\S+/)?.[0] ?? "";
    token = consentUrlShownToMinor.split("/").pop() ?? "";
    await shot(minor, "03-consent-requested");
    // The consent link is the guardian's credential. The funnel may only
    // show it as the "email is not set up" fallback (staging has no
    // RESEND_API_KEY); with email configured it must not appear.
    const emailFallback = await minor.getByText(/Email is not set up on this environment/i).isVisible().catch(() => false);
    if (!emailFallback) {
      softExpect(consentUrlShownToMinor, "consent link shown to the minor in the funnel").toBe("");
    }
    softExpect(await minor.getByPlaceholder(/Paste consent token/i).count(), "minor can paste a consent token").toBe(0);
    // The link must point at this environment's player app.
    if (consentUrlShownToMinor) {
      softExpect(consentUrlShownToMinor.startsWith(`${E2E_URLS.player}/parental-consent/`), `consent link host (${consentUrlShownToMinor.slice(0, 60)})`).toBe(true);
    }
    const [r] = await stagingSql<{ parent: string | null }>("select metadata->>'parentEmail' parent from registrations where id = $1", [submissionId]);
    expect(r!.parent, "parent email stored (db-row)").toBe(parentEmail);
    // Anyone with the submission id can build base64url(id:time). The API
    // must reject such a token (REG-6: tokens are HMAC-signed now).
    const forged = Buffer.from(`${submissionId}:${Date.now()}`).toString("base64url");
    const api = `${E2E_URLS.player.replace("player", "api")}/api/public/registration/parental-consent/${forged}`;
    const forgedStatus = (await fetch(api).catch(() => null))?.status ?? 0;
    softExpect(forgedStatus, `forged consent token accepted by ${api.slice(0, 60)}`).toBeGreaterThanOrEqual(400);
  });

  test("4 · guardian opens /parental-consent/[token] in a fresh browser and confirms", async ({ browser }) => {
    test.skip(!token, "BLOCKED: no consent token produced");
    const ctx = await newCtx(browser);
    const parent = await ctx.newPage();
    const errs = watchErrors(parent);
    await parent.goto(`${E2E_URLS.player}/parental-consent/${token}`);
    await expect(parent.getByText(fullName).first()).toBeVisible({ timeout: 30_000 });
    await expect(parent.getByText(j3.seasonName!).first()).toBeVisible();
    await shot(parent, "04-parent-portal");
    // UC-28 / REG-15: the guardian reads the consent, types their full legal
    // name and ticks the box; Confirm stays disabled until both are done.
    await expect(parent.getByText(/I am the parent or legal guardian/).first()).toBeVisible();
    const confirmBtn = parent.getByRole("button", { name: /Sign and confirm registration/i });
    await expect(confirmBtn, "Confirm disabled before signing").toBeDisabled();
    const guardianName = `Pat ${last}Guardian`;
    await parent.getByLabel(/Your full legal name/i).fill(guardianName);
    await parent.locator("input[type=checkbox]").check();
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();
    await expect(parent.getByText(/Consent signed and recorded/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(parent.getByText(`Signed by ${guardianName}`, { exact: false }).first()).toBeVisible();
    await shot(parent, "04-parent-confirmed");
    const [r] = await stagingSql<{ status: string; confirmed: string | null }>(
      "select status, metadata->>'parentConsentConfirmedAt' confirmed from registrations where id = $1",
      [submissionId]
    );
    expect(r!.status).toBe("pending_payment");
    expect(r!.confirmed).toBeTruthy();
    // REG-15: one consent record on the child, under a `parental` document,
    // carrying the guardian's typed name; the registration points at it.
    const consentRows = await stagingSql<{ id: string; kind: string; label: string; sig: string | null }>(
      `select cs.id, d.kind, cs.signature_blob_url label, r.metadata->>'parentConsentSignatureId' sig
         from consent_signatures cs
         join registrations r on r.subject_person_id = cs.person_id
         join document_versions dv on dv.id = cs.document_version_id
         join documents d on d.id = dv.document_id
        where r.id = $1 and d.kind = 'parental'`,
      [submissionId]
    );
    expect(consentRows.length, "parental consent record stored after the guardian signs").toBe(1);
    expect(consentRows[0]!.sig, "registration points at the consent record").toBe(consentRows[0]!.id);
    expect(decodeURIComponent(consentRows[0]!.label), "signature carries the guardian's name").toContain(guardianName);
    softExpect(errs.filter((e) => /http 5/.test(e)), "5xx on parental-consent page").toEqual([]);
    await ctx.close();
  });

  test("5 · minor's funnel continues after the guardian consented", async () => {
    test.skip(!token, "BLOCKED: no consent token");
    // The guardian already confirmed via their link (step 4); the minor
    // only checks status now (REG-7 fix: no token entry on the minor side).
    await minor.getByRole("button", { name: /My parent has confirmed/i }).click();
    await minor.waitForTimeout(4000);
    await shot(minor, "05-minor-after-parent");
    const stuck = await minor.getByText(/Parental consent required/i).isVisible().catch(() => false);
    const errText = stuck ? (await minor.locator("p.text-sm").filter({ hasText: /./ }).allInnerTexts()).join(" ") : "";
    softExpect(stuck, `minor stuck on consent step after guardian already confirmed (${errText.slice(0, 120)})`).toBe(false);
    if (stuck) {
      // Recover the way a user would: reload the funnel and sign in again.
      await minor.goto(`${E2E_URLS.player}/register/${j3.seasonId}`);
      await minor.getByRole("button", { name: /Register as a player/i }).click();
      await minor.getByRole("button", { name: /^Next/ }).click();
      await minor.getByRole("tab", { name: /^sign in$/i }).click();
      await minor.getByLabel(/^Email/).first().fill(email);
      await minor.getByLabel(/^Password/).first().fill(PASSWORD);
      await minor.getByRole("button", { name: /Sign in & continue/i }).click();
      await expect(minor.getByRole("button", { name: /Next: Waivers/ })).toBeVisible({ timeout: 30_000 });
      const level = minor.locator("select").filter({ has: minor.locator("option", { hasText: /Pick a level/ }) }).first();
      if ((await level.inputValue()) === "") await level.selectOption("C");
      const usa = minor.getByPlaceholder("e.g. 1234567890").first();
      if (await usa.isVisible().catch(() => false) && !(await usa.inputValue())) await usa.fill("MIN12345");
      await minor.getByRole("button", { name: /Next: Waivers/ }).click();
    }
    await expect(minor.getByText(/Eligibility checks|Parental consent required/i).first()).toBeVisible({ timeout: 30_000 });
    if (await minor.getByRole("heading", { name: /Parental consent required/i }).isVisible().catch(() => false)) {
      await shot(minor, "05-minor-dead-end");
      const [r] = await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]);
      throw new Error(
        `Dead end: after the guardian consented (db status=${r!.status}) the funnel still shows "Parental consent required" ` +
          `and "Confirm consent" fails ("An unexpected error occurred"); the minor cannot reach waivers or payment.`
      );
    }
    await expect(minor.getByText(/Eligibility checks/i).first()).toBeVisible({ timeout: 30_000 });
    phases.push(`waivers:${await activePhase(minor)}`);
    await shot(minor, "05-minor-compliance");
    const hasLiability = await minor.getByText(/Type your full legal name to sign/i).first().isVisible().catch(() => false);
    // REG-5: the required waiver is always presented (server-resolved list).
    expect(hasLiability, "required liability waiver presented in the minor's funnel (UC-27, REG-5)").toBe(true);
    // UC-27: for a minor the guardian signs the waiver, not the child.
    const pageText = await minor.locator("body").innerText();
    softExpect(/guardian|parent/i.test(pageText.slice(pageText.indexOf("Eligibility checks"))), "waiver step asks the guardian (not the minor) to sign").toBe(true);
    if (hasLiability) {
      const docs = minor.locator("div.max-h-48.overflow-y-auto");
      for (let i = 0; i < (await docs.count()); i++) {
        await docs.nth(i).evaluate((el) => {
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event("scroll"));
        });
      }
      await minor.getByLabel(/Type your full legal name to sign/i).first().fill(fullName);
      await minor.getByRole("button", { name: /^Sign$/ }).first().click();
      await expect(minor.getByText(/^Signed$/i).first()).toBeVisible({ timeout: 30_000 });
    }
    await minor.getByRole("switch", { name: /Code of conduct/i }).click();
    await minor.getByRole("button", { name: /Next: Payment/ }).click();
    await minor.getByText(new RegExp(`${j3.runTag} Adult`)).first().click();
    await minor.getByRole("button", { name: /^Continue/ }).click();
    await minor.getByRole("button", { name: /Continue to payment/ }).click();
    await minor.getByRole("button", { name: /^Pay \$/ }).click();
    await expect.poll(() => activePhase(minor), { timeout: 60_000, message: "funnel reaches Confirmation after Pay" }).not.toMatch(/PAYMENT/i);
    await shot(minor, "05-minor-done");
    const [r] = await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]);
    expect(r!.status).toBe("pending_review");
  });

  test("6 · admin approves the consented minor (org_admin, else super_admin)", async ({ browser }) => {
    test.skip(!submissionId, "BLOCKED: no submission");
    const [cur] = await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]);
    test.skip(cur!.status !== "pending_review", `BLOCKED: registration is ${cur!.status}, not pending_review (minor never reached payment)`);
    const context = await newCtx(browser);
    const page = await context.newPage();
    await signIn(page, E2E_URLS.orgAdmin, SMOKE_USERS.orgAdmin);
    await page.goto(`${E2E_URLS.orgAdmin}/registrations`);
    const row = page.locator("tr", { hasText: fullName });
    if (await row.isVisible({ timeout: 15_000 }).catch(() => false)) {
      softExpect(await row.innerText(), "OA row shows minor / consent state").toMatch(/consent|minor|guardian/i);
      await row.getByRole("button", { name: /approve/i }).click();
    } else {
      await context.close();
      const ctx2 = await newCtx(browser);
      const sa = await ctx2.newPage();
      await signIn(sa, E2E_URLS.superadmin, SMOKE_USERS.superAdmin);
      await sa.goto(`${E2E_URLS.superadmin}/registrations`);
      const srow = sa.locator("tr", { hasText: email });
      await expect(srow).toBeVisible({ timeout: 30_000 });
      await srow.getByRole("button", { name: /^Review$/ }).click();
      const dlg = sa.getByRole("dialog");
      await shot(sa, "06-sa-review-minor");
      softExpect(await dlg.innerText(), "SA review dialog shows guardian consent evidence").toMatch(/consent|guardian|parent/i);
      await dlg.getByRole("button", { name: /^Approve$/ }).click();
    }
    await expect.poll(async () => (await stagingSql<{ status: string }>("select status from registrations where id = $1", [submissionId]))[0]?.status, { timeout: 30_000 }).toBe("approved");
    await context.close().catch(() => {});
  });

  test("7 · findings logged along the way", async () => {
    expect(findings, "soft findings (see doc/testing/bugs/registration.md)").toEqual([]);
  });
});
