import { openNav, stagingDbUrl } from "./_helpers";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
// ./_helpers fails to load (bad playwright.config import path, SETUP-1),
// so this file carries the helpers it needs.
import { BYPASS_STATE_PATH } from "../../../playwright.config";

/**
 * J2 · Invite admin and sign in (doc/testing/pphl-journey-matrix.md)
 *
 * super_admin @ superadmin-web /users "Invite user":
 *   - org_admin for the staging org (org picker)
 *   - league_admin for the staging league (league picker)
 *   - captain for the staging team (team picker)
 *   - one magic-link invite (no password) to see what the invitee gets
 * Each invitee then signs in on THEIR app in a fresh context and must
 * land on a view scoped to what they were granted.
 * Also: /users/[id] role editing on the super_admin row, /roles.
 *
 * Invitees are created through the UI's own "Also set initial
 * credentials" option, not the admin API. Emails:
 * staging-e2e+<RUN_TAG>-<role>@sportspulse.us. STAGING ONLY.
 */

const IS_STAGING = process.env.E2E_TARGET === "staging";
const RUN_TAG = process.env.E2E_RUN_TAG ?? `E2E${Date.now().toString(36).toUpperCase()}`;
const tag = RUN_TAG.toLowerCase();
const SA = E2E_URLS.superadmin;
const PASSWORD = `Pphl-${RUN_TAG}-x9!`;

const STAGING_ORG = "PPHL Staging";
const STAGING_LEAGUE = "PPHL Staging League";
const STAGING_TEAM = "Staging Skaters";

const INVITEES = {
  orgAdmin: { email: `staging-e2e+${tag}-oa@sportspulse.us`, name: `OA ${RUN_TAG}`, role: "org_admin", scope: "org", pick: STAGING_ORG, app: E2E_URLS.orgAdmin },
  leagueAdmin: { email: `staging-e2e+${tag}-la@sportspulse.us`, name: `LA ${RUN_TAG}`, role: "league_admin", scope: "league", pick: STAGING_LEAGUE, app: E2E_URLS.league },
  captain: { email: `staging-e2e+${tag}-cap@sportspulse.us`, name: `Cap ${RUN_TAG}`, role: "captain", scope: "team", pick: STAGING_TEAM, app: E2E_URLS.teamAdmin }
} as const;
const MAGIC = { email: `staging-e2e+${tag}-magic@sportspulse.us`, name: `Magic ${RUN_TAG}` };

async function ctx(browser: Browser) {
  return browser.newContext(existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {});
}
function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return errors;
}
let sqlClient: ((q: string, p?: unknown[]) => Promise<any[]>) | null = null;
async function stagingSql(q: string, p: unknown[] = [], attempt = 0): Promise<any[]> {
  if (!IS_STAGING) throw new Error("staging only");
  if (!sqlClient) {
    const { createRequire } = await import("node:module");
    const { resolve } = await import("node:path");
    const env: Record<string, string> = {};
    for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i > 0 && !line.startsWith("#")) env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
    }
    const postgres = createRequire(resolve("packages/db/package.json"))("postgres");
    const sql = postgres(
      stagingDbUrl(env),
      { max: 1, ssl: "require", prepare: false }
    );
    sqlClient = (qq, pp = []) => sql.unsafe(qq, pp as any[]);
  }
  try {
    return await sqlClient(q, p);
  } catch (e) {
    // The staging pooler drops idle connections (ECONNRESET); reconnect once.
    if (attempt < 2 && /ECONNRESET|CONNECTION_|terminated/i.test((e as Error).message)) {
      sqlClient = null;
      return stagingSql(q, p, attempt + 1);
    }
    throw e;
  }
}
const findings: string[] = [];
async function softly(fn: () => void | Promise<void>) {
  try {
    await fn();
  } catch (e) {
    const msg = (e as Error).message.split("\n").slice(0, 6).join(" | ");
    findings.push(msg);
    console.log(`[J2 finding] ${msg}`);
  }
}

test.describe.serial("J2 · invite admin and sign in", () => {
  test.skip(!IS_STAGING, "mutating journey — staging only");
  test.setTimeout(180_000);

  let sa: { context: BrowserContext; page: Page };
  let saErrors: string[];

  test.beforeAll(async ({ browser }) => {
    const context = await ctx(browser);
    const page = await context.newPage();
    await signIn(page, SA, SMOKE_USERS.superAdmin);
    sa = { context, page };
    saErrors = watch(page);
  });
  test.afterAll(async () => {
    console.log(`[J2] RUN_TAG=${RUN_TAG}`);
    console.log(`[J2] super_admin errors:\n${saErrors.join("\n")}`);
    await sa?.context.close();
  });

  test("1. invite dialog: entry point, defaults, pickers", async () => {
    const page = sa.page;
    await page.goto(`${SA}/dashboard`);
    await openNav(page, /^Users$/);
    await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Invite user" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByText("Also grant a role on invite.").click();
    const role = dialog.locator("select").first();
    const roleOptions = await role.locator("option").allTextContents();
    console.log(`[J2] role options: ${roleOptions.join(" | ")}`);
    // Readable labels, not raw codes (commit 057550a fixed this elsewhere).
    await softly(async () =>
      expect(roleOptions.filter((o) => /^[a-z_]+ —/.test(o)), "SETUP-7: Invite role dropdown shows raw role codes ('org_admin — …')").toEqual([])
    );
    const scopeOptions = await dialog.locator("select").nth(1).locator("option").allTextContents();
    console.log(`[J2] scope options: ${scopeOptions.join(" | ")}`);
    await softly(async () =>
      expect(scopeOptions.filter((o) => /^[a-z]+$/.test(o)), "SETUP-7: Invite scope dropdown shows raw scope codes").toEqual([])
    );
    // Picker, not UUID: type the first letters of the org name.
    await dialog.getByRole("button", { name: /Pick a org|Pick an org/i }).click();
    await dialog.getByPlaceholder(/Search (orgs|organi[sz]ations)/i).fill("PPH");
    await expect(dialog.getByRole("button", { name: new RegExp(STAGING_ORG) }).first()).toBeVisible();
    console.log(`[J2] org picker typed "PPH" -> match visible`);
    await page.keyboard.press("Escape");
    if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Close", exact: true }).click({ timeout: 5_000 });
  });

  for (const [key, inv] of Object.entries(INVITEES)) {
    test(`2.${key} super_admin invites a ${inv.role} with ${inv.scope} scope + profile in the same flow`, async () => {
      const page = sa.page;
      await page.goto(`${SA}/users`);
      await page.getByRole("button", { name: "Invite user" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder("captain@example.com").fill(inv.email);
      await dialog.getByPlaceholder("Sasha Velasquez").fill(inv.name);
      await dialog.getByText("Also set initial credentials.").click();
      await dialog.getByPlaceholder("e.g. Welcome2026!").fill(PASSWORD);
      await dialog.getByText("Also grant a role on invite.").click();
      const role = dialog.locator("select").first();
      const value = await role.locator("option").evaluateAll(
        (opts, code) => (opts as HTMLOptionElement[]).find((o) => o.value === code)?.value ?? null,
        inv.role
      );
      expect(value, `role ${inv.role} offered`).toBe(inv.role);
      await role.selectOption(inv.role);
      const scope = dialog.locator("select").nth(1);
      expect(await scope.inputValue(), `scope type snaps to ${inv.scope} for ${inv.role}`).toBe(inv.scope);
      await dialog.locator("button", { hasText: /^Pick (a|an) / }).click();
      await dialog.getByPlaceholder(/Search .*s by name/i).fill(inv.pick.slice(0, 4));
      await dialog.getByRole("button", { name: new RegExp(inv.pick) }).first().click();

      // Connected action: set up the role profile in the same dialog.
      const profileBox = dialog.getByText(/Also set up the .* profile now\./);
      await expect(profileBox).toBeVisible();
      const profileEnabled = await dialog
        .locator("label", { hasText: /Also set up the .* profile now\./ })
        .locator("input[type=checkbox]")
        .isEnabled();
      console.log(`[J2] ${inv.role} profile-in-same-flow checkbox enabled=${profileEnabled}`);
      if (profileEnabled) {
        await profileBox.click();
        const fields = await dialog.locator("input:visible, select:visible, textarea:visible").count();
        console.log(`[J2] ${inv.role} profile form controls visible=${fields}`);
      }

      const resp = page.waitForResponse((r) => /\/iam\/.*invite/.test(r.url()) && r.request().method() === "POST");
      await dialog.getByRole("button", { name: "Send invite" }).click();
      const r = await resp;
      const body = await r.json().catch(() => ({}));
      console.log(`[J2] invite ${inv.role} -> ${r.status()} created=${body.created} emailDelivered=${body.emailDelivered} reason=${body.emailDeliveryReason}`);
      expect(r.status()).toBeLessThan(300);
      await expect(dialog.getByText(/Account created for/)).toBeVisible();
      console.log(`[J2] invite subject: ${body.message?.subject}`);
      await softly(async () =>
        expect(`${body.message?.subject}\n${body.message?.body}`, "SETUP-13: invite message has mojibake (UTF-8 em dash decoded as cp1252)").not.toMatch(/â€/)
      );
      await softly(async () =>
        expect(body.emailDelivered, `SETUP-8: invite email not delivered (${body.emailDeliveryReason})`).toBe(true)
      );
      const err = dialog.locator("p.text-rose-600, p[class*=rose]");
      const errCount = await err.count();
      const errText = errCount ? await err.first().textContent() : "";
      await softly(async () => expect(errCount, `invite ${inv.role}: error text ${errText}`).toBe(0));
      // The footer Close (the X in the corner is also named Close, CONSOLE-10).
      await dialog.getByRole("button", { name: "Close", exact: true }).last().click({ timeout: 10_000 });
      await expect(dialog).toBeHidden();
      // Same-surface refresh: new row in the list without reload.
      await expect(page.getByRole("link", { name: inv.name })).toBeVisible({ timeout: 15_000 });

      const rows = await stagingSql(
        `select r.code, a.scope_type, a.scope_id from user_role_assignments a join roles r on r.id=a.role_id
          join auth.users u on u.id=a.user_id where u.email=$1 and a.revoked_at is null`,
        [inv.email]
      );
      expect(rows.map((x) => `${x.code}/${x.scope_type}`)).toEqual([`${inv.role}/${inv.scope}`]);
    });
  }

  test("3. magic-link invite (no password): what the invitee gets", async () => {
    const page = sa.page;
    await page.goto(`${SA}/users`);
    await page.getByRole("button", { name: "Invite user" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("captain@example.com").fill(MAGIC.email);
    await dialog.getByPlaceholder("Sasha Velasquez").fill(MAGIC.name);
    await dialog.getByText("Also grant a role on invite.").click();
    await dialog.locator("select").first().selectOption("org_admin");
    await dialog.locator("button", { hasText: /^Pick (a|an) / }).click();
    await dialog.getByPlaceholder(/Search (orgs|organi[sz]ations)/i).fill("PPH");
    await dialog.getByRole("button", { name: new RegExp(STAGING_ORG) }).first().click();
    const resp = page.waitForResponse((r) => /\/iam\/.*invite/.test(r.url()) && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Send invite" }).click();
    const r = await resp;
    const body = await r.json().catch(() => ({}));
    console.log(`[J2] magic invite -> ${r.status()} emailDelivered=${body.emailDelivered} reason=${body.emailDeliveryReason}`);
    console.log(`[J2] magic invite message body:\n${body.message?.body}`);
    const flash = await dialog.locator("p[class*=emerald], p[class*=rose]").first().textContent({ timeout: 5_000 }).catch(() => "");
    console.log(`[J2] magic invite flash: ${flash}`);
    // The flash claims an email was sent; the API reports whether it was.
    await softly(async () =>
      expect(
        { flashSaysSent: /Invite sent/.test(flash ?? ""), emailDelivered: body.emailDelivered },
        "SETUP-8: flash says 'Invite sent' even when the API reports emailDelivered=false"
      ).not.toEqual({ flashSaysSent: true, emailDelivered: false })
    );
    // Where does the invite link land? Supabase invite with no redirectTo
    // falls back to the project Site URL, not the invitee's app.
    const [u] = await stagingSql("select invited_at, email_confirmed_at, encrypted_password is not null and encrypted_password <> '' as has_pw from auth.users where email=$1", [MAGIC.email]);
    console.log(`[J2] magic invitee auth row: ${JSON.stringify(u)}`);
    const linkInMessage = /https?:\/\/\S+/.exec(body.message?.body ?? "")?.[0] ?? null;
    console.log(`[J2] link in rendered message: ${linkInMessage}`);
  });

  for (const [key, inv] of Object.entries(INVITEES)) {
    test(`4.${key} ${inv.role} signs in on their own app and lands on a scoped view`, async ({ browser }) => {
      const context = await ctx(browser);
      const page = await context.newPage();
      const errors = watch(page);
      try {
        await signIn(page, inv.app, inv.email, PASSWORD);
        await page.waitForLoadState("networkidle");
        const landed = new URL(page.url()).pathname;
        console.log(`[J2] ${inv.role} landed on ${inv.app}${landed}`);
        await softly(async () =>
          expect(landed, `${inv.role} first sign-in should land on the console, not ${landed}`).not.toMatch(/sign-in/)
        );
        if (landed.startsWith("/onboarding")) {
          console.log(`[J2] ${inv.role} onboarding text: ${(await page.locator("main, body").first().innerText()).slice(0, 400)}`);
        }
        const text = await page.locator("body").innerText();
        if (key === "orgAdmin") {
          await page.goto(`${inv.app}/leagues`);
          await expect(page.getByText(STAGING_LEAGUE).first()).toBeVisible();
          // org_admin scoped to PPHL Staging must not see run-tagged orgs from other journeys.
          await expect(page.getByText(/PPHL League E2E/)).toHaveCount(0);
        } else if (key === "leagueAdmin") {
          await page.goto(`${inv.app}/leagues`);
          await expect(page.getByText(STAGING_LEAGUE).first()).toBeVisible();
          const others = await page.locator("main table tbody tr").allInnerTexts();
          console.log(`[J2] league_admin /leagues rows: ${others.length}`);
          await softly(async () =>
            expect(others.filter((t) => !t.includes(STAGING_LEAGUE)), "league_admin sees leagues outside their scope").toEqual([])
          );
        } else {
          await softly(async () => expect(text, "captain home shows their team").toContain(STAGING_TEAM));
        }
      } finally {
        console.log(`[J2] ${inv.role} errors:\n${errors.join("\n")}`);
        await context.close();
      }
    });
  }

  test("5. /users Type column reflects real roles", async () => {
    const page = sa.page;
    await page.goto(`${SA}/users`);
    await page.waitForLoadState("networkidle");
    for (const inv of Object.values(INVITEES)) {
      const row = page.getByRole("row", { name: new RegExp(inv.email.replace(/[.+]/g, "\\$&")) });
      await softly(async () => expect(row, `Type column for ${inv.role} invitee`).toContainText(new RegExp(inv.role, "i")));
    }
    const orgRow = page.getByRole("row", { name: /staging-org@sportspulse\.us/ });
    console.log(`[J2] staging-org row: ${await orgRow.innerText()}`);
    await softly(async () => expect(orgRow, "Type column for staging org_admin").toContainText(/org_admin|org admin/i));
  });

  test("6. role editing on the super_admin row defaults to super_admin", async () => {
    const page = sa.page;
    // Two passes: a quick click (what a real admin does) and a click after
    // the page has gone network-idle, to tell a load race from a logic bug.
    for (const settle of [false, true]) {
      await page.goto(`${SA}/users`);
      if (settle) {
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);
      }
      const saRow = page.getByRole("row", { name: /staging-superadmin@sportspulse\.us/ });
      await saRow.getByRole("button", { name: /SUPER ADMIN/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(1500);
      const selected = await dialog.locator("#ar-role option:checked").textContent({ timeout: 5_000 }).catch(() => null);
      console.log(`[J2] Change user type on super_admin row (settled=${settle}) -> selected role: ${selected}`);
      await softly(async () => expect(selected ?? "", `SETUP-17: Change user type on super_admin row defaults to '${selected}' (settled=${settle})`).toMatch(/super/i));
      await page.keyboard.press("Escape");

      await page.goto(`${SA}/users`);
      if (settle) {
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);
      }
      await page.getByRole("row", { name: /staging-superadmin@sportspulse\.us/ }).getByRole("button", { name: "User actions" }).click();
      await page.getByText("Edit role profile").click();
      const d2 = page.getByRole("dialog");
      await expect(d2).toBeVisible();
      await page.waitForTimeout(1500);
      const d2text = await d2.innerText();
      console.log(`[J2] Edit role profile on super_admin row (settled=${settle}): ${d2text.slice(0, 300).replace(/\n/g, " / ")}`);
      await softly(async () => expect(d2text, `SETUP-17: Edit role profile on super_admin row says the user has no role (settled=${settle})`).not.toMatch(/no role assigned/i));
      await softly(async () => expect(d2text, "Edit role profile on super_admin row must not open the player form").not.toMatch(/player profile|jersey|shoots/i));
      await page.keyboard.press("Escape");
    }

    // /users/[id] for the super admin
    const [me] = await stagingSql("select id from auth.users where email=$1", [SMOKE_USERS.superAdmin]);
    await page.goto(`${SA}/users/${me.id}`);
    await expect(page.getByText(/Super admin has implicit access|Active role assignments/).first()).toBeVisible();
    const sel = await page.locator("#ar-role option:checked").textContent({ timeout: 5_000 }).catch(() => null);
    console.log(`[J2] /users/[id] super_admin AssignRolePanel default: ${sel}`);
    await softly(async () => expect(sel ?? "", "/users/[id] role default for super_admin").toMatch(/super/i));

    // /users/[id] for the invited org admin: scope shows a name, not a UUID prefix.
    const [oa] = await stagingSql("select id from auth.users where email=$1", [INVITEES.orgAdmin.email]);
    await page.goto(`${SA}/users/${oa.id}`);
    const scopeLine = await page.getByText(/scope: org/i).first().innerText();
    console.log(`[J2] org admin assignment line: ${scopeLine}`);
    await softly(async () => expect(scopeLine, "SETUP-9: assignment shows scope as raw UUID prefix instead of org name").toContain(STAGING_ORG));
  });

  test("7. /roles page", async () => {
    const page = sa.page;
    await page.goto(`${SA}/dashboard`);
    await openNav(page, /^Roles & permissions$/);
    await expect(page.getByRole("heading", { name: /Roles/, level: 1 })).toBeVisible();
    const text = await page.locator("main").innerText();
    const title = await page.title();
    console.log(`[J2] /roles title: ${title}`);
    await softly(async () =>
      expect(`${title}\n${text}`, "SETUP-13: /roles renders mojibake ('â€”' for an em dash)").not.toMatch(/â€/)
    );
    for (const code of ["org_admin", "league_admin", "captain", "player"]) {
      await softly(async () => expect(text, `/roles lists ${code}`).toMatch(new RegExp(code.replace("_", "[_ ]"), "i")));
    }
  });

  test("8. no bug findings were recorded along the journey", async () => {
    expect(findings, findings.join("\n")).toEqual([]);
  });
});
