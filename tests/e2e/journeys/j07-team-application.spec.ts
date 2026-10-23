import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql } from "./_helpers";

/**
 * J7 · Captain registers a team (approval gate).
 * doc/testing/pphl-journey-matrix.md § 3 · bug log doc/testing/bugs/captain.md (CAP-n)
 *
 *   super_admin @ SA /org-setup     → league + season (reg window today) + 2 divisions
 *   super_admin @ SA /seasons/[id]  → status registration_open
 *   super_admin @ SA /forms         → form bound to season, active pricing tier
 *   captain     @ TA /captain/register → season → division A → apply → "submitted"
 *   super_admin @ SA /seasons/[id]/applications, /division-applications, /divisions/[A] → reject A
 *   captain     @ TA sees rejection + reason → apply to division B
 *   super_admin @ SA approves B
 *   captain     @ TA sees approved → set-up wizard → complete
 *   super_admin @ SA /divisions/[B] and org_admin @ OA /divisions/[B] list the team
 *   player-web  /captain/register parity (deep link to team-admin)
 *
 * Staging only. Every row is named with RUN_TAG.
 */

test.describe.configure({ mode: "serial" });
test.skip(!IS_STAGING, "journeys mutate data: staging only");
test.setTimeout(180_000);
// The org-setup wizard turns a picked date into local midnight and the API
// checks the UTC date (CAP-21); run in UTC so "registration opens today"
// is accepted whatever the tester's timezone.
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000, timezoneId: "UTC" });

const OUT = `${process.env.E2E_OUTPUT_DIR ?? "test-results"}-evidence/j07-${RUN_TAG}`;
const SEASON_NAME = `${RUN_TAG} Season`;
const LEAGUE_NAME = `${RUN_TAG} League`;
const DIV_A = `${RUN_TAG} Div A`;
const DIV_B = `${RUN_TAG} Div B`;
const TEAM_ID = process.env.STAGING_TEAM_ENTITY_ID ?? "d4136494-50d6-4451-956c-ef6e72d6a411";

/** Defects observed while walking. The last test fails if any were recorded. */
const findings: string[] = [];
function finding(ok: boolean, msg: string) {
  if (!ok) {
    findings.push(msg);
    test.info().annotations.push({ type: "defect", description: msg });
  }
}

type Ctx = { context: BrowserContext; page: Page; app: string; errors: string[] };
let sa: Ctx;
let cap: Ctx;
const ids: { leagueId?: string; seasonId?: string; divA?: string; divB?: string; entryA?: string; entryB?: string } = {};

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !/_vercel|favicon|\.png|\.svg/.test(r.url())) {
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

function isoDate(offsetDays: number): string {
  // Browser-local calendar date: the org-setup wizard validates
  // "today or later" against the browser clock.
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA");
}

test.beforeAll(async ({ browser }) => {
  const s = await signedInAs(browser, "superAdmin");
  sa = { ...s, errors: watch(s.page) };
  const c = await signedInAs(browser, "teamAdmin");
  cap = { ...c, errors: watch(c.page) };
});

test.afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    `${OUT}/errors.json`,
    JSON.stringify({ ids, sa: sa?.errors, captain: cap?.errors }, null, 2)
  );
  await sa?.context.close();
  await cap?.context.close();
});

async function loadIds() {
  const rows = await stagingSql<{ season_id: string; league_id: string }>(
    `select id season_id, league_id from seasons where name = $1`,
    [SEASON_NAME]
  );
  if (!rows[0]) return false;
  ids.seasonId = rows[0].season_id;
  ids.leagueId = rows[0].league_id;
  const divs = await stagingSql<{ id: string; name: string }>(
    `select id, name from divisions where season_id = $1`,
    [ids.seasonId]
  );
  ids.divA = divs.find((d) => d.name === DIV_A)?.id;
  ids.divB = divs.find((d) => d.name === DIV_B)?.id;
  const entries = await stagingSql<{ id: string; division_id: string }>(
    `select id, division_id from division_team_entries where team_id = $1 and division_id in ($2, $3) order by created_at`,
    [TEAM_ID, ids.divA, ids.divB]
  );
  ids.entryA = entries.find((e) => e.division_id === ids.divA)?.id;
  ids.entryB = entries.find((e) => e.division_id === ids.divB)?.id;
  return true;
}

test("J7.1 super_admin creates league + season + 2 divisions through /org-setup", async () => {
  // Re-running with the same E2E_RUN_TAG resumes on the season it created.
  if (await loadIds()) return;
  const p = sa.page;
  await p.goto(`${sa.app}/seasons`);
  await settle(p);
  // Entry point: the Seasons page offers "New season -> Org setup".
  await p.getByRole("link", { name: /new season/i }).click();
  await p.waitForURL(/\/org-setup/);
  await settle(p);
  // Step 1: pick the org.
  await p.getByText("PPHL Staging", { exact: true }).first().click();
  await p.getByRole("button", { name: /next: league/i }).click();
  // Step 2: league. There is no "use an existing league" option here.
  await p.getByPlaceholder("e.g. New Hampshire AHL").fill(LEAGUE_NAME);
  // Sport defaults to the alphabetically-first sport (AFL); PPHL is ice hockey.
  const sport = p.locator("select:has(option[value='HOCKEY_ICE'])").first();
  finding((await sport.inputValue()) !== "AFL", "CAP: org-setup Sport defaults to AFL (alphabetic-first), not the org's sport");
  await sport.selectOption("HOCKEY_ICE");
  await snap(p, "01-org-setup-league");
  await p.getByRole("button", { name: /next: season/i }).click();
  // Step 3: season with a registration window that includes today.
  await p.getByPlaceholder("e.g. NH Fall 2025").fill(SEASON_NAME);
  const dates = p.locator("input[type='date']");
  await dates.nth(0).fill(isoDate(30)); // season start
  await dates.nth(1).fill(isoDate(200)); // season end
  await dates.nth(2).fill(isoDate(0)); // registration opens (today)
  await dates.nth(3).fill(isoDate(25)); // registration closes
  await dates.nth(4).fill(isoDate(28)); // roster lock
  await snap(p, "02-org-setup-season");
  await p.getByRole("button", { name: /next: divisions/i }).click();
  // Step 4: two divisions.
  await p.getByPlaceholder("e.g. AHL").first().fill(DIV_A);
  await p.getByRole("button", { name: /add (another )?division/i }).click();
  // The new card renders collapsed; expand it before typing.
  await p.getByRole("button", { name: "Expand" }).last().click();
  await p.locator("input[placeholder='e.g. AHL']:visible").last().fill(DIV_B);
  await snap(p, "03-org-setup-divisions");
  await p.getByRole("button", { name: /publish league/i }).click();
  await p.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await settle(p);
  await snap(p, "04-league-created");

  const rows = await stagingSql<{ season_id: string; status: string; opens: string; closes: string; league_id: string }>(
    `select s.id season_id, s.status, s.registration_opens_at::text opens, s.registration_closes_at::text closes, s.league_id
       from seasons s where s.name = $1`,
    [SEASON_NAME]
  );
  expect(rows, "season row persisted").toHaveLength(1);
  ids.seasonId = rows[0]!.season_id;
  ids.leagueId = rows[0]!.league_id;
  const divs = await stagingSql<{ id: string; name: string }>(
    `select id, name from divisions where season_id = $1`,
    [ids.seasonId]
  );
  ids.divA = divs.find((d) => d.name === DIV_A)?.id;
  ids.divB = divs.find((d) => d.name === DIV_B)?.id;
  expect(ids.divA && ids.divB, "both divisions persisted").toBeTruthy();
});

test("J7.2 super_admin opens registration on the season (status dropdown)", async () => {
  const p = sa.page;
  await p.goto(`${sa.app}/seasons`);
  await settle(p);
  await p.getByText(SEASON_NAME).first().click();
  await p.waitForURL(new RegExp(`/seasons/${ids.seasonId}`));
  await settle(p);
  await snap(p, "05-season-detail");
  const [before] = await stagingSql<{ status: string }>(`select status from seasons where id = $1`, [ids.seasonId]);
  if (before?.status !== "registration_open") {
    await p.getByRole("button", { name: /^draft$/i }).first().click();
    const opt = p.locator("li button", { hasText: "Registration open" });
    await opt.click();
    await expect(opt).toBeHidden({ timeout: 15_000 }).catch(() => {});
    await settle(p);
  }
  await expect(p.getByText(/registration open/i).first()).toBeVisible();
  await snap(p, "06-season-status-open");
  const [row] = await stagingSql<{ status: string }>(`select status from seasons where id = $1`, [ids.seasonId]);
  expect(row?.status).toBe("registration_open");
});

test("J7.3 super_admin configures an active pricing tier via /forms", async () => {
  const [tier] = await stagingSql<{ id: string }>(
    `select id from pricing_tiers where season_id = $1 and is_active`,
    [ids.seasonId]
  );
  if (tier) return;
  const p = sa.page;
  await p.goto(`${sa.app}/forms`);
  await settle(p);
  await snap(p, "07-forms-list");
  await p.getByRole("button", { name: /new form|create form/i }).first().click();
  await p.locator("#orgId").selectOption({ label: "PPHL Staging" });
  await p.locator("#scope").selectOption("league");
  await expect(p.locator("#leagueId option", { hasText: LEAGUE_NAME })).toHaveCount(1, { timeout: 20_000 });
  await p.locator("#leagueId").selectOption({ label: LEAGUE_NAME });
  await p.locator("#name").fill(`${RUN_TAG} Team Registration`);
  await snap(p, "08-create-form-filled");
  await p.getByRole("dialog").getByRole("button", { name: /create/i }).last().click()
    .catch(() => p.getByRole("button", { name: /^create( form)?$/i }).last().click());
  await p.waitForURL(/\/forms\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await settle(p);
  await snap(p, "09-form-created");

  // 01 Season setup: bind the form to our season (picker, not free text).
  const seasonSelect = p.locator(`select:has(option[value='${ids.seasonId}'])`).first();
  await expect(seasonSelect).toBeVisible({ timeout: 20_000 });
  await seasonSelect.selectOption(ids.seasonId!);
  await p.getByRole("button", { name: /^save$/i }).first().click().catch(() => {});
  await settle(p);
  await snap(p, "10-form-season-bound");

  // 02 Pricing: one season-wide tier, $1,400, active.
  await p.getByText("Pricing", { exact: true }).first().click();
  await settle(p);
  await p.getByRole("button", { name: /new tier/i }).click();
  const price = p.locator("label:has-text('Full price (cents)') input").first();
  await expect(price).toBeVisible();
  await price.fill("140000");
  await price.blur();
  await settle(p);
  await p.getByRole("button", { name: /active/i }).first().click();
  await settle(p);
  await snap(p, "11-pricing-tier");
  await expect
    .poll(async () => (await stagingSql<{ n: number }>(
      `select count(*)::int n from pricing_tiers where season_id = $1 and is_active and full_price_cents = 140000`,
      [ids.seasonId]
    ))[0]?.n, { timeout: 20_000 })
    .toBe(1);
});

test("J7.4 captain finds the open season and applies to division A", async () => {
  const p = cap.page;
  p.on("dialog", (d) => d.accept());
  await p.goto(`${cap.app}/`);
  await settle(p);
  await snap(p, "20-captain-home");
  // Entry point: sidebar "Register the team" CTA shows while a season is open.
  const cta = p.getByRole("link", { name: /register the team/i }).first();
  finding(await cta.isVisible().catch(() => false), "CAP: captain home has no 'Register the team' entry while a season is open");
  await p.goto(`${cap.app}/captain/register`);
  await settle(p);
  await snap(p, "21-captain-register-landing");
  const card = p.getByRole("link").filter({ hasText: SEASON_NAME }).first();
  await expect(card, "our open season is listed for the captain").toBeVisible();
  await card.click();
  await p.waitForURL(new RegExp(`/captain/register/${ids.seasonId}`));
  await settle(p);
  await snap(p, "22-division-picker");
  await p.getByRole("button").filter({ hasText: DIV_A }).first().click();
  await p.getByRole("button", { name: /apply for this division/i }).click();
  await p.waitForURL(/submitted=/, { timeout: 30_000 });
  await settle(p);
  const text = await snap(p, "23-application-submitted");
  expect(text).toMatch(/Application submitted/i);
  expect(text).toContain(DIV_A);
  const rows = await stagingSql<{ id: string; entry_status: string }>(
    `select id, entry_status from division_team_entries where team_id = $1 and division_id = $2`,
    [TEAM_ID, ids.divA]
  );
  expect(rows[0]?.entry_status).toBe("pending_approval");
  ids.entryA = rows[0]!.id;
  // Duplicate submit guard: back to the picker, apply again -> refused.
  await p.goto(`${cap.app}/captain/register/${ids.seasonId}`);
  await settle(p);
  await p.getByRole("button").filter({ hasText: DIV_B }).first().click();
  await p.getByRole("button", { name: /apply for this division/i }).click();
  await p.getByText(/already has an active application|already applied/i).first()
    .waitFor({ timeout: 10_000 }).catch(() => {});
  const dup = await snap(p, "24-duplicate-apply");
  finding(
    /already has an active application|already applied/i.test(dup),
    `CAP: duplicate apply shows no readable refusal (got: ${dup.slice(-300)})`
  );
  const n = await stagingSql<{ n: number }>(
    `select count(*)::int n from division_team_entries e join divisions d on d.id = e.division_id
      where e.team_id = $1 and d.season_id = $2 and e.entry_status = 'pending_approval'`,
    [TEAM_ID, ids.seasonId]
  );
  expect(n[0]?.n, "only one pending application per season").toBe(1);
});

test("J7.5 super_admin sees the application in every admin queue and denies division A", async () => {
  const p = sa.page;
  p.on("dialog", (d) => d.accept());
  await p.goto(`${sa.app}/seasons/${ids.seasonId}/applications`);
  await settle(p);
  const q = await snap(p, "30-season-applications");
  expect(q, "season applications queue lists the team").toContain("Staging Skaters");
  await p.goto(`${sa.app}/division-applications`);
  await settle(p);
  const da = await snap(p, "31-division-applications");
  finding(
    da.includes(DIV_A) || da.includes("Staging Skaters"),
    "CAP: /division-applications (Needs decision) does not list the pending application"
  );
  await p.goto(`${sa.app}/divisions/${ids.divA}`);
  await settle(p);
  const dd = await snap(p, "32-division-A-detail");
  finding(/pending/i.test(dd) && dd.includes("Staging Skaters"), "CAP: division detail does not show the pending application");
  // Deny from the season queue with a reason.
  await p.goto(`${sa.app}/seasons/${ids.seasonId}/applications`);
  await settle(p);
  await p.getByRole("button", { name: /deny/i }).first().click();
  await p.getByRole("dialog").locator("input").fill(`${RUN_TAG} wrong skill tier for this team`);
  await p.getByRole("dialog").getByRole("button", { name: /^deny$/i }).click();
  await settle(p);
  await snap(p, "33-after-deny");
  await expect
    .poll(async () => (await stagingSql<{ s: string }>(`select entry_status s from division_team_entries where id = $1`, [ids.entryA]))[0]?.s)
    .toBe("rejected");
});

test("J7.6 captain sees the denial with reason and re-applies to division B", async () => {
  const p = cap.page;
  await p.goto(`${cap.app}/captain/register`);
  await settle(p);
  const t = await snap(p, "40-captain-sees-denial");
  finding(/not approved/i.test(t) && t.includes("wrong skill tier"), "CAP: captain register page does not show the denial + admin reason");
  const reapply = p.getByRole("link", { name: /apply to a different division/i });
  if (await reapply.isVisible().catch(() => false)) {
    await reapply.click();
  } else {
    await p.getByRole("link").filter({ hasText: SEASON_NAME }).first().click();
  }
  await p.waitForURL(new RegExp(`/captain/register/${ids.seasonId}`));
  await settle(p);
  await p.getByRole("button").filter({ hasText: DIV_B }).first().click();
  await p.getByRole("button", { name: /apply for this division/i }).click();
  await p.waitForURL(/submitted=/, { timeout: 30_000 });
  await snap(p, "41-reapplied-B");
  const rows = await stagingSql<{ id: string; entry_status: string }>(
    `select id, entry_status from division_team_entries where team_id = $1 and division_id = $2`,
    [TEAM_ID, ids.divB]
  );
  expect(rows[0]?.entry_status).toBe("pending_approval");
  ids.entryB = rows[0]!.id;
});

test("J7.7 super_admin approves division B from the division detail page", async () => {
  const p = sa.page;
  await p.goto(`${sa.app}/divisions/${ids.divB}`);
  await settle(p);
  await snap(p, "50-division-B-pending");
  const approve = p.getByRole("button", { name: /approve/i }).first();
  if (await approve.isVisible().catch(() => false)) {
    await approve.click();
  } else {
    finding(false, "CAP: division detail has no inline Approve for a pending application");
    await p.goto(`${sa.app}/seasons/${ids.seasonId}/applications`);
    await settle(p);
    await p.getByRole("button", { name: /approve/i }).first().click();
  }
  await settle(p);
  await snap(p, "51-after-approve");
  await expect
    .poll(async () => (await stagingSql<{ s: string }>(`select entry_status s from division_team_entries where id = $1`, [ids.entryB]))[0]?.s)
    .toBe("applied");
});

test("J7.8 captain sees approval and completes the set-up wizard (roster + dues split)", async () => {
  const p = cap.page;
  await p.goto(`${cap.app}/captain/register`);
  await settle(p);
  const t = await snap(p, "60-captain-approved");
  expect(t).toMatch(/Application approved/i);
  finding(/\$1,400/.test(t), "CAP: approved card does not show the $1,400 team fee from the active pricing tier");
  await p.getByRole("link", { name: /set up roster & dues/i }).click();
  await p.waitForURL(new RegExp(`/captain/register/setup/${ids.entryB}`));
  await settle(p);
  await snap(p, "61-wizard-step1");
  const nextBtn = p.getByRole("button", { name: /^next$/i });
  await nextBtn.click();
  // Step 2: the admin-approved division should be preselected.
  await snap(p, "62-wizard-step2");
  finding(
    await nextBtn.isEnabled(),
    "CAP: wizard step 2 does not preselect the approved division (captain must re-pick and can pick a different one)"
  );
  await p.getByRole("button").filter({ hasText: DIV_B }).first().click();
  await nextBtn.click();
  // Step 3: roster by email only.
  const email1 = `staging-e2e+${RUN_TAG.toLowerCase()}-w1@sportspulse.us`;
  const email2 = `staging-e2e+${RUN_TAG.toLowerCase()}-w2@sportspulse.us`;
  const box = p.getByPlaceholder(/player@example.com/);
  await box.fill(email1);
  await box.press("Enter");
  await box.fill(email2);
  await box.press("Enter");
  await snap(p, "63-wizard-step3");
  await nextBtn.click();
  const s4 = await snap(p, "64-wizard-step4");
  finding(/700/.test(s4), "CAP: dues split step does not show $700 per player for an even split of $1,400");
  const before = await p.locator("main").first().innerText();
  await p.getByRole("button", { name: /submit registration/i }).click();
  await settle(p);
  await expect
    .poll(async () => (await stagingSql<{ i: string | null }>(`select invoice_id i from division_team_entries where id = $1`, [ids.entryB]))[0]?.i, { timeout: 30_000 })
    .toBeTruthy();
  await p.waitForTimeout(3000);
  const after = await snap(p, "65-wizard-submitted");
  finding(after !== before, "CAP: wizard screen did not change after a successful submit (no confirmation state)");
  const [dte] = await stagingSql<{ entry_status: string; invoice_id: string | null }>(
    `select entry_status, invoice_id from division_team_entries where id = $1`,
    [ids.entryB]
  );
  expect(["applied", "confirmed"]).toContain(dte?.entry_status);
  expect(dte?.invoice_id, "master invoice linked").toBeTruthy();
  const subs = await stagingSql<{ n: number; total: number }>(
    `select count(*)::int n, coalesce(sum(total_cents),0)::int total from invoices where parent_invoice_id = $1`,
    [dte!.invoice_id]
  );
  expect(subs[0]).toEqual({ n: 2, total: 140000 });
  const inv = await stagingSql<{ n: number }>(
    `select count(*)::int n from team_invites where team_id = $1 and season_id = $2 and invitee_email in ($3,$4)`,
    [TEAM_ID, ids.seasonId, email1, email2]
  );
  expect(inv[0]?.n).toBe(2);
  await p.waitForTimeout(5000);
  const notes = await stagingSql<{ template_code: string; status: string; body: string | null; last_error: string | null }>(
    `select template_code, status, body, last_error from notifications where recipient_email in ($1,$2)`,
    [email1, email2]
  );
  writeFileSync(`${OUT}/66-invite-notifications.json`, JSON.stringify(notes, null, 2));
  const inviteNotes = notes.filter((n) => n.template_code === "TEAM_INVITE_NEW");
  finding(inviteNotes.length === 2, `CAP: wizard submit queued ${inviteNotes.length} TEAM_INVITE_NEW notifications for 2 invited players`);
  finding(
    inviteNotes.length > 0 && inviteNotes.every((n) => !!n.body && /https?:\/\//.test(n.body)),
    `CAP: invite email body has no usable link (bodies: ${JSON.stringify(inviteNotes.map((n) => n.body)).slice(0, 400)})`
  );
});

test("J7.9 team appears in SA and OA division detail", async ({ browser }) => {
  const p = sa.page;
  await p.goto(`${sa.app}/divisions/${ids.divB}`);
  await settle(p);
  const sat = await snap(p, "70-sa-division-B");
  expect(sat).toContain("Staging Skaters");
  const oa = await signedInAs(browser, "orgAdmin");
  const oaErr = watch(oa.page);
  await oa.page.goto(`${oa.app}/divisions/${ids.divB}`);
  await settle(oa.page);
  const oat = await snap(oa.page, "71-oa-division-B");
  finding(oat.includes("Staging Skaters"), "CAP: org-admin /divisions/[id] does not list the approved team");
  writeFileSync(`${OUT}/oa-errors.json`, JSON.stringify(oaErr, null, 2));
  await oa.context.close();
  await cap.page.goto(`${cap.app}/captain/register`);
  await settle(cap.page);
  await snap(cap.page, "72-captain-register-final");
});

test("J7.10 player-web captain entry deep-links to team-admin (no duplicate route)", async ({ browser }) => {
  const pl = await signedInAs(browser, "player");
  await pl.page.goto(`${pl.app}/`);
  await settle(pl.page);
  const link = pl.page.getByRole("link", { name: /register your team/i }).first();
  await expect(link).toHaveAttribute("href", /staging-team\.sportspulse\.us\/captain\/register/);
  const res = await pl.page.goto(`${pl.app}/captain/register`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/80-player-captain-register-status.txt`, String(res?.status()));
  await snap(pl.page, "80-player-captain-register");
  await pl.context.close();
});

test("J7.11 approval gate: re-opening the wizard must not register the team in the denied division", async () => {
  // The wizard URL stays reachable after confirmation, and step 2 lists
  // every division in the season. Picking the DENIED division and
  // submitting must not produce an active entry there.
  const p = cap.page;
  await p.goto(`${cap.app}/captain/register/setup/${ids.entryB}`);
  await settle(p);
  const t = await snap(p, "90-wizard-reopened");
  if (!/Pick your division|Team details/i.test(t)) return; // wizard locked: gate holds
  const nextBtn = p.getByRole("button", { name: /^next$/i });
  await nextBtn.click();
  await p.getByRole("button").filter({ hasText: DIV_A }).first().click();
  await nextBtn.click();
  const box = p.getByPlaceholder(/player@example.com/);
  await box.fill(`staging-e2e+${RUN_TAG.toLowerCase()}-w3@sportspulse.us`);
  await box.press("Enter");
  await nextBtn.click();
  await p.getByRole("button", { name: /submit registration/i }).click();
  await settle(p);
  await p.waitForTimeout(5000);
  await snap(p, "91-wizard-denied-division-submitted");
  const rows = await stagingSql<{ entry_status: string }>(
    `select entry_status from division_team_entries where team_id = $1 and division_id = $2 order by created_at`,
    [TEAM_ID, ids.divA]
  );
  writeFileSync(`${OUT}/92-divA-entries.json`, JSON.stringify(rows));
  finding(
    !rows.some((r) => ["applied", "accepted", "confirmed"].includes(r.entry_status)),
    `CAP: wizard registered the team into the DENIED division without admin approval (div A entries: ${JSON.stringify(rows)})`
  );
});

test("J7.z no defects recorded during the walk", async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  expect(findings, findings.join("\n")).toEqual([]);
});
