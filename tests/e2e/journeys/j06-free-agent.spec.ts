import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, RUN_TAG, freshContext, signedInAs, stagingSql } from "./_helpers";

/**
 * J6 · Free agent placed on a team (UC-03).
 * doc/testing/pphl-journey-matrix.md § 3 · bug log doc/testing/bugs/captain.md (CAP-n)
 *
 *   new visitor  @ PL /sign-up            → can a brand-new account reach the free-agent form?
 *   player       @ PL /register/free-agent → lists self for the team's current season
 *   captain      @ TA /captain/free-agents → sees the pool → claims
 *   super_admin  @ SA /registrations, org_admin @ OA /registrations → admin view of the pool
 *   player       @ PL /team                → sees the team
 *
 * The free agent is a labelled fixture: auth user created with the staging
 * admin API (sign-up needs email confirmation on staging), then given the
 * player role by super_admin through /users/[id].
 */

test.describe.configure({ mode: "serial" });
test.skip(!IS_STAGING, "journeys mutate data: staging only");
test.setTimeout(180_000);
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

const OUT = `${process.env.E2E_OUTPUT_DIR ?? "test-results"}-evidence/j06-${RUN_TAG}`;
const TEAM_ID = process.env.STAGING_TEAM_ENTITY_ID ?? "d4136494-50d6-4451-956c-ef6e72d6a411";
const SEASON_ID = process.env.STAGING_SEASON_ID ?? "922061b1-3ad4-47d9-9223-88d8271b0251";
const tag = RUN_TAG.toLowerCase();
const FA_EMAIL = `staging-e2e+${tag}-fa@sportspulse.us`;
const FA_PASSWORD = `E2e!${RUN_TAG}x9`;
const FA_FIRST = `Free${RUN_TAG}`;
const SIGNUP_EMAIL = `staging-e2e+${tag}-signup@sportspulse.us`;

const findings: string[] = [];
function finding(ok: boolean, msg: string) {
  if (!ok) {
    findings.push(msg);
    test.info().annotations.push({ type: "defect", description: msg });
  }
}

type Ctx = { context: BrowserContext; page: Page; app: string; errors: string[] };
let cap: Ctx;
let fa: Ctx;
let poolSeason: { id: string; name: string } | null = null;

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !/_vercel|favicon|\.png|\.svg/.test(r.url()) && r.request().method() !== "OPTIONS") {
      errors.push(`http ${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`);
    }
  });
  return errors;
}

async function snap(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {});
  const text = await page.locator("main").first().innerText().catch(() => page.locator("body").innerText().catch(() => ""));
  writeFileSync(`${OUT}/${name}.txt`, `URL ${page.url()}\n\n${text}`);
  return text;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

async function adminCreateUser(email: string, password: string, displayName: string): Promise<string> {
  const url = process.env.STAGING_SUPABASE_URL!;
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!;
  const existing = await stagingSql<{ id: string }>(`select id from auth.users where email = $1`, [email]);
  if (existing[0]) return existing[0].id;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: displayName } })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`fixture user create failed: ${res.status} ${JSON.stringify(body)}`);
  return body.id as string;
}

test.afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/errors.json`, JSON.stringify({ captain: cap?.errors, freeAgent: fa?.errors, poolSeason }, null, 2));
  await cap?.context.close();
  await fa?.context.close();
});

test("J6.0 a brand-new visitor signs up on player-web and looks for the free-agent form", async ({ browser }) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await p.goto(`${E2E_URLS.player}/sign-up`);
  await settle(p);
  await snap(p, "00-signup");
  // Walk the funnel generically: fill what is visible, press the primary button.
  for (let i = 0; i < 6; i++) {
    const email = p.locator("input[type='email']");
    if (await email.isVisible().catch(() => false)) await email.fill(SIGNUP_EMAIL);
    for (const pw of await p.locator("input[type='password']").all()) await pw.fill(FA_PASSWORD);
    const name = p.getByLabel(/name/i).first();
    if (await name.isVisible().catch(() => false)) await name.fill(`Signup ${RUN_TAG}`);
    for (const cb of await p.locator("input[type='checkbox']").all()) await cb.check().catch(() => {});
    const btn = p.getByRole("button", { name: /continue|next|create|sign up|get started|start/i }).last();
    if (!(await btn.isVisible().catch(() => false))) break;
    const before = await p.locator("body").innerText();
    await btn.click().catch(() => {});
    await settle(p);
    await p.waitForTimeout(1500);
    await snap(p, `01-signup-step-${i}`);
    if ((await p.locator("body").innerText()) === before) break;
  }
  await p.waitForTimeout(15_000);
  const end = await snap(p, "02-signup-end");
  finding(!/Saving…/.test(end), "CAP: player-web sign-up hangs on 'Saving…' after Create account (no confirm-email message, no error)");
  writeFileSync(`${OUT}/02-signup-url.txt`, p.url());
  const users = await stagingSql<{ app: unknown }>(`select raw_app_meta_data app from auth.users where email = $1`, [SIGNUP_EMAIL]);
  writeFileSync(`${OUT}/02-signup-user.json`, JSON.stringify(users));
  finding(
    users.length === 0 || JSON.stringify(users[0]?.app ?? {}).includes("player"),
    "CAP: player-web self sign-up creates an account with no role_codes; that account is refused by player-web (sign-in?error=wrong_role), so it can never reach /register/free-agent"
  );
  finding(!/error/i.test(end) || /check your email|confirm/i.test(end), `CAP: sign-up funnel ends in an error (${end.slice(0, 200)})`);
  await ctx.close();
});

test("J6.1 free agent lists themself for the team's current season", async ({ browser }) => {
  const userId = await adminCreateUser(FA_EMAIL, FA_PASSWORD, `${FA_FIRST} Agent`);
  const roles = await stagingSql<{ n: number }>(
    `select count(*)::int n from user_role_assignments a join roles r on r.id=a.role_id where a.user_id=$1 and r.code='player' and a.revoked_at is null`,
    [userId]
  );
  if (!roles[0]?.n) {
    const sa = await signedInAs(browser, "superAdmin");
    await sa.page.goto(`${sa.app}/users/${userId}`);
    await settle(sa.page);
    const opt = await sa.page.locator("#ar-role option").filter({ hasText: /^player/i }).first().getAttribute("value");
    await sa.page.locator("#ar-role").selectOption(opt!);
    await sa.page.locator("#ar-scope-type").selectOption("org");
    await expect(sa.page.locator("#ar-scope-id option", { hasText: "PPHL Staging" })).toHaveCount(1, { timeout: 20_000 });
    await sa.page.locator("#ar-scope-id").selectOption({ label: "PPHL Staging" });
    await sa.page.getByRole("button", { name: /assign/i }).last().click();
    await sa.page.getByText(/^Assigned /).waitFor({ timeout: 20_000 });
    await settle(sa.page);
    await snap(sa.page, "10-sa-assigned-player-role");
    await sa.context.close();
  }
  const s = await signedInAs(browser, "player", { email: FA_EMAIL, password: FA_PASSWORD });
  fa = { ...s, errors: watch(s.page) };
  const p = fa.page;
  await p.goto(`${fa.app}/register`);
  await settle(p);
  await snap(p, "11-register-hub");
  await p.getByRole("link", { name: /open the form|free-agent/i }).first().click();
  await p.waitForURL(/\/register\/free-agent/);
  await settle(p);
  await snap(p, "12-free-agent-form");
  await p.getByRole("button", { name: /^Staging 2026-27/ }).click();
  await p.getByRole("button", { name: /^defense$/i }).click();
  const [resp] = await Promise.all([
    p.waitForResponse((r) => /free-agent-pool/.test(r.url()) && r.request().method() === "POST", { timeout: 20_000 }).catch(() => null),
    p.getByRole("button", { name: /join the pool|update entry/i }).click()
  ]);
  writeFileSync(`${OUT}/13-submit-response.txt`, resp ? `${resp.status()} ${await resp.text().catch(() => "")}` : "no POST observed");
  await settle(p);
  await p.waitForTimeout(1500);
  const sub = await snap(p, "13-free-agent-submitted");
  finding(!!resp && resp.ok(), `CAP: 'Join the pool' did not save (${resp ? resp.status() : "no request"}); screen: ${sub.slice(-200)}`);
  finding(/you're in the pool|saved|listed|active/i.test(sub), "CAP: free-agent 'Join the pool' gives no visible confirmation");
  await expect
    .poll(async () => (await stagingSql<{ status: string }>(
      `select f.status from free_agent_pool_entries f join persons pe on pe.id=f.player_person_id join auth.users u on u.id=pe.user_id
        where u.email=$1 and f.season_id=$2`,
      [FA_EMAIL, SEASON_ID]
    ))[0]?.status, { timeout: 15_000 })
    .toBe("active");
});

test("J6.2 captain browses the pool for the team's season", async ({ browser }) => {
  const c = await signedInAs(browser, "teamAdmin");
  cap = { ...c, errors: watch(c.page) };
  const p = cap.page;
  await p.goto(`${cap.app}/`);
  await settle(p);
  await p.getByRole("link", { name: /^free agents$/i }).first().click();
  await p.waitForURL(/\/captain\/free-agents/);
  await settle(p);
  await p.getByText(/Pool is empty|CLAIM/i).first().waitFor({ timeout: 30_000 }).catch(() => {});
  const t = await snap(p, "20-captain-pool");
  finding(
    t.includes(FA_FIRST),
    "CAP: captain /captain/free-agents does not show a free agent listed for the team's current season (Staging 2026-27); the pool follows the team's newest division entry instead"
  );
  // Which season does the captain pool actually read? (newest entry of any status)
  const [row] = await stagingSql<{ id: string; name: string; entry_status: string }>(
    `select s.id, s.name, e.entry_status from division_team_entries e join divisions d on d.id=e.division_id join seasons s on s.id=d.season_id
      where e.team_id=$1 order by e.created_at desc limit 1`,
    [TEAM_ID]
  );
  poolSeason = row ? { id: row.id, name: row.name } : null;
  writeFileSync(`${OUT}/20-pool-season.json`, JSON.stringify(row));
});

test("J6.3 free agent also lists for the season the captain sees; captain claims", async () => {
  test.skip(!poolSeason || poolSeason.id === SEASON_ID, "captain pool already reads the current season");
  const p = fa.page;
  await p.goto(`${fa.app}/register/free-agent`);
  await settle(p);
  const seasonBtn = p.getByRole("button", { name: new RegExp(`^${poolSeason!.name}`) });
  const listed = await seasonBtn.isVisible().catch(() => false);
  finding(listed, `CAP: free-agent form does not offer the season the captain's pool reads (${poolSeason!.name})`);
  if (!listed) return;
  await seasonBtn.click();
  await p.getByRole("button", { name: /^defense$/i }).click();
  await p.getByRole("button", { name: /join the pool|update entry/i }).click();
  await settle(p);
  await snap(p, "30-fa-listed-second-season");

  const c = cap.page;
  c.on("dialog", (d) => d.accept());
  await c.goto(`${cap.app}/captain/free-agents`);
  await settle(c);
  await c.getByText(/Pool is empty|CLAIM/i).first().waitFor({ timeout: 30_000 }).catch(() => {});
  const pool = await snap(c, "31-captain-pool-again");
  expect(pool, "free agent visible in captain pool").toContain(FA_FIRST);
  const row = c.locator("li, tr").filter({ hasText: FA_FIRST }).first();
  await Promise.all([
    c.waitForResponse((r) => /free-agent-pool\/.*\/place/.test(r.url()), { timeout: 30_000 }).catch(() => null),
    row.getByRole("button", { name: /claim/i }).click()
  ]);
  await settle(c);
  await c.waitForTimeout(3000);
  await expect
    .poll(async () => (await c.locator("main").first().innerText()).includes(FA_FIRST), { timeout: 15_000 })
    .toBe(false).catch(() => {});
  const after = await snap(c, "32-after-claim");
  finding(!after.includes(FA_FIRST) || /placed|claimed/i.test(after), "CAP: claimed free agent still shows as available in the pool without reload");
  await expect
    .poll(async () => (await stagingSql<{ status: string }>(
      `select f.status from free_agent_pool_entries f join persons pe on pe.id=f.player_person_id join auth.users u on u.id=pe.user_id
        where u.email=$1 and f.season_id=$2`,
      [FA_EMAIL, poolSeason!.id]
    ))[0]?.status, { timeout: 20_000 })
    .toBe("placed");
  const mem = await stagingSql<{ n: number }>(
    `select count(*)::int n from team_memberships m join persons pe on pe.id=m.person_id join auth.users u on u.id=pe.user_id
      where m.team_id=$1 and u.email=$2 and m.current_status='active'`,
    [TEAM_ID, FA_EMAIL]
  );
  expect(mem[0]?.n, "claim created an active membership").toBeGreaterThan(0);
  await c.waitForTimeout(4000);
  const notes = await stagingSql<{ n: number }>(
    `select count(*)::int n from notifications n join persons pe on pe.id = n.recipient_person_id join auth.users u on u.id=pe.user_id where u.email=$1`,
    [FA_EMAIL]
  );
  finding((notes[0]?.n ?? 0) > 0, "CAP: claim sent no notification to the free agent; UC-03 'player accepts or declines captain's invite' is skipped (claim places the player directly)");
});

test("J6.4 free agent sees the team in player-web /team and the form shows 'placed'", async () => {
  test.skip(!poolSeason, "no pool season");
  const p = fa.page;
  await p.goto(`${fa.app}/team`);
  await settle(p);
  const t = await snap(p, "40-fa-team");
  finding(t.includes("Staging Skaters"), "CAP: player-web /team does not show the team after the captain claimed the free agent");
  await p.goto(`${fa.app}/register/free-agent`);
  await settle(p);
  const f = await snap(p, "41-fa-form-after-claim");
  finding(/placed/i.test(f), "CAP: free-agent form does not show the entry as placed after the claim");
});

test("J6.5 admins can see the free-agent pool (SA and OA /registrations)", async ({ browser }) => {
  const sa = await signedInAs(browser, "superAdmin");
  await sa.page.goto(`${sa.app}/registrations`);
  await settle(sa.page);
  const st = await snap(sa.page, "50-sa-registrations");
  finding(st.includes(FA_FIRST), "CAP: superadmin /registrations has no free-agent pool view (UC-03 'Admin manually assigns player to a team' has no screen)");
  await sa.context.close();
  const oa = await signedInAs(browser, "orgAdmin");
  await oa.page.goto(`${oa.app}/registrations`);
  await settle(oa.page);
  const ot = await snap(oa.page, "51-oa-registrations");
  finding(ot.includes(FA_FIRST), "CAP: org-admin /registrations has no free-agent pool view");
  await oa.context.close();
});

test("J6.z no defects recorded during the walk", async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  expect(findings, findings.join("\n")).toEqual([]);
});
