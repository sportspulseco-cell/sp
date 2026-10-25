import { stagingDbUrl } from "./_helpers";
/**
 * J10 · Schedule generate and publish (UC-06, UC-07, UC-08, UC-09, UC-10, UC-21)
 *
 * super_admin @ superadmin-web /venues builds rink inventory, then
 * /scheduling/[seasonId]/* generates + publishes; captain @ team-admin-web
 * /schedule and player @ player-web /schedule (fresh contexts) must show the
 * published games and the player gets a schedule notification.
 *
 * Bugs found are logged in doc/testing/bugs/schedule.md (SCH-N). Steps that
 * hit a bug fail via expect.soft so the walk continues to the destination.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Browser, BrowserContext, Page, Response } from "@playwright/test";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH, OUTPUT_DIR } from "../../../playwright.config";

// ---------------------------------------------------------------------------
// Inlined helpers. ./_helpers imports "../../playwright.config", which is one
// directory short from tests/e2e/journeys and fails to load (SCH-0 note).
// ---------------------------------------------------------------------------
const IS_STAGING = process.env.E2E_TARGET === "staging";
const RUN_TAG = process.env.E2E_RUN_TAG ?? `E2E${Date.now().toString(36).toUpperCase()}`;
type Role = "superAdmin" | "leagueAdmin" | "orgAdmin" | "teamAdmin" | "player";
const APP: Record<Role, string> = {
  superAdmin: E2E_URLS.superadmin, leagueAdmin: E2E_URLS.league, orgAdmin: E2E_URLS.orgAdmin,
  teamAdmin: E2E_URLS.teamAdmin, player: E2E_URLS.player
};
async function signedInAs(browser: Browser, role: Role) {
  const context = await browser.newContext(
    IS_STAGING && existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {}
  );
  const page = await context.newPage();
  await signIn(page, APP[role], SMOKE_USERS[role]);
  return { context, page, app: APP[role] };
}
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => {
    if (r.status() >= 400 && /\/api\/|functions\/v1/.test(r.url())) {
      errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  return errors;
}
let sqlClient: ((q: string, p?: unknown[]) => Promise<any[]>) | null = null;
async function stagingSql<T = Record<string, any>>(q: string, params: unknown[] = []): Promise<T[]> {
  if (!IS_STAGING) throw new Error("stagingSql only runs against staging");
  if (!sqlClient) {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    const f = resolve(".env.local");
    if (existsSync(f)) {
      for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i < 1 || line.startsWith("#")) continue;
        env[line.slice(0, i)] ??= line.slice(i + 1).replace(/^"|"$/g, "");
      }
    }
    const postgres = createRequire(resolve("packages/db/package.json"))("postgres");
    const sql = postgres(
      stagingDbUrl(env),
      { max: 1, ssl: "require", prepare: false }
    );
    sqlClient = (qq, p = []) => sql.unsafe(qq, p as any[]);
  }
  return (await sqlClient(q, params)) as T[];
}
/**
 * Pick a team in the New game dialog the way an admin does (SCH-20): type part
 * of its name into the team picker and click the match. The picker holds every
 * team entered in the chosen division (all pages), so a missing option is a
 * hard failure.
 */
async function pickTeam(dlg: import("@playwright/test").Locator, label: string, name: string, typed: string) {
  const input = dlg.getByLabel(label);
  await input.click();
  await input.fill(typed);
  const option = dlg.getByRole("listbox").getByRole("option", { name, exact: true });
  await expect(option, `SCH-20 "${name}" found by typing "${typed}" in ${label}`).toBeVisible({ timeout: 15_000 });
  await option.click();
  await expect(input).toHaveValue(name);
}

/**
 * Fill the New game dialog: league, season, division, both teams, rink, rink-
 * local start (SCH-5). A team clash with an earlier run on shared staging is
 * scheduled anyway with a reason, the way an admin overrides one (UC-07).
 */
async function scheduleGame(
  page: Page,
  o: { league: string; season: string; divisionId: string; away: string; home: string; rink: string | null; startLocal: string; tag: string }
) {
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("League").selectOption({ label: o.league });
  await expect(dlg.getByLabel("Season").locator("option", { hasText: o.season }).first()).toBeAttached({ timeout: 30_000 });
  await dlg.getByLabel("Season").selectOption({ label: o.season });
  await expect(dlg.locator(`#divisionId option[value="${o.divisionId}"]`)).toHaveCount(1, { timeout: 30_000 });
  await dlg.getByLabel("Division").selectOption(o.divisionId);
  await expect(dlg.getByText(/teams? entered in/)).toBeVisible({ timeout: 30_000 });
  // SCH-20: a name nobody has is answered plainly, not with a random list.
  await dlg.getByLabel("Away team").fill("zzqx-no-such-team");
  await expect(dlg.getByText(/No team in this division matches/)).toBeVisible();
  await pickTeam(dlg, "Away team", o.away, o.away.slice(-6));
  await pickTeam(dlg, "Home team", o.home, o.home.slice(0, 5));
  const rink = dlg.getByLabel("Rink");
  await expect(rink.locator("option").nth(1), "SCH-5 rink picker lists the org's rinks").toBeAttached({ timeout: 30_000 });
  const rinkOpts = await rink.locator("option").allInnerTexts();
  const label = o.rink ?? rinkOpts.find((x) => x !== "Pick a rink")!;
  await rink.selectOption({ label });
  await expect(dlg.getByText(/^Rink time \(/), "SCH-5 start time is in the rink's zone").toBeVisible();
  await dlg.getByLabel("Date and time").fill(o.startLocal);
  const created = page.waitForResponse((r) => /\/api\/games$/.test(r.url()) && r.request().method() === "POST", { timeout: 30_000 });
  await dlg.getByRole("button", { name: "Schedule game" }).click();
  let r = await created;
  if (r.status() === 409) {
    console.log(`[${o.tag}] New game clash: ${(await dlg.innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
    await dlg.getByLabel("Reason").fill(`${o.tag} rerun on shared staging`);
    const forced = page.waitForResponse((x) => /\/api\/games$/.test(x.url()) && x.request().method() === "POST", { timeout: 30_000 });
    await dlg.getByRole("button", { name: "Schedule anyway" }).click();
    r = await forced;
  }
  expect(r.status(), "SCH-5 New game accepted").toBe(201);
  await expect(dlg).toBeHidden({ timeout: 20_000 });
  return { rink: label };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUTPUT_DIR}/j10/${name}.png`, fullPage: true }).catch(() => {});
}
/** Wait for a Supabase Edge Function call (or its CORS failure) and describe it. */
async function edgeCall(page: Page, fn: string, action: () => Promise<void>): Promise<string> {
  const failed = page.waitForEvent("requestfailed", { predicate: (r) => r.url().includes(`/functions/v1/${fn}`), timeout: 30_000 }).then((r) => `requestfailed ${r.failure()?.errorText}`).catch(() => null);
  const ok = page.waitForResponse((r: Response) => r.url().includes(`/functions/v1/${fn}`) && r.request().method() !== "OPTIONS", { timeout: 30_000 }).then(async (r) => `http ${r.status()} ${await r.text().catch(() => "")}`.slice(0, 400)).catch(() => null);
  await action();
  return (await Promise.race([ok, failed])) ?? (await ok) ?? (await failed) ?? "no request seen";
}

/**
 * Create a team through /teams/new the way an admin would (no home rink).
 * SCH-18: the POST returns 500 "An unexpected error occurred" when Home rink
 * is blank, yet the team row is already inserted. A real admin then clicks
 * Create again, gets the duplicate-name guard, and follows "Use existing team".
 */
async function createTeamViaUi(page: Page, name: string, tag: string): Promise<string> {
  const base = new URL(page.url()).origin;
  await page.goto(`${base}/teams/new`);
  const org = page.getByLabel(/Organisation/i).first();
  const shownOrg = await org.evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex]?.text ?? "");
  console.log(`[${tag}] new-team default organisation="${shownOrg}"`);
  await org.selectOption({ label: "PPHL Staging" });
  await page.getByLabel(/Team name/i).fill(name);
  const sport = page.getByLabel(/Sport/i).first();
  if ((await sport.inputValue()) === "") await sport.selectOption("HOCKEY_ICE");
  const resp = page.waitForResponse((r) => /\/api\/league\/teams$/.test(r.url()) && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /Create team/i }).click();
  const r = await resp;
  const body = (await r.text().catch(() => "")).slice(0, 300);
  console.log(`[${tag}] POST /league/teams → ${r.status()} ${body}`);
  expect.soft(r.status(), "SCH-18 team create succeeds without a home rink").toBeLessThan(400);
  if (r.status() < 400) {
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}/, { timeout: 30_000 });
    return page.url().match(/teams\/([0-9a-f-]{36})/)![1]!;
  }
  const visible = await page.locator("main").innerText();
  console.log(`[${tag}] visible error: ${visible.match(/An unexpected error occurred|already exists[^.]*/)?.[0]}`);
  const orphan = await stagingSql<{ id: string; external_ids: unknown }>(`select id, external_ids from teams where name = $1`, [name]);
  console.log(`[${tag}] team row after failed create: ${JSON.stringify(orphan)}`);
  expect.soft(orphan.length, "SCH-18 failed create leaves no orphan team row").toBe(0);
  // Retry like a user.
  await page.getByRole("button", { name: /Create team/i }).click();
  await expect(page.getByText(/already exists in this organisation/i).first()).toBeVisible({ timeout: 20_000 });
  const useExisting = page.getByRole("link", { name: /existing team/i });
  const hasLink = await useExisting.isVisible().catch(() => false);
  console.log(`[${tag}] duplicate guard shows "Use existing team" link: ${hasLink}`);
  // SCH-19: the deep link never renders (error body not passed to the form).
  expect.soft(hasLink, "SCH-19 duplicate guard offers the existing team").toBe(true);
  if (hasLink) await useExisting.click();
  else {
    await page.goto(`${base}/teams`);
    await page.getByRole("link", { name }).first().click();
  }
  await page.waitForURL(/\/teams\/[0-9a-f-]{36}/, { timeout: 30_000 });
  return page.url().match(/teams\/([0-9a-f-]{36})/)![1]!;
}

// Base staging fixtures (seeded, not created by this spec).
const SEASON_NAME = "Staging 2026-27";
const BASE_TEAM = "Staging Skaters";

test.describe("J10 schedule generate and publish", () => {
  test.skip(!IS_STAGING, "J10 mutates data; staging only");
  test.setTimeout(900_000);

  let sa: { context: BrowserContext; page: Page; app: string };
  let saErrors: string[] = [];
  let seasonId = "";
  let divisionId = "";
  const venueName = `${RUN_TAG} Arena`;
  const teamName = `${RUN_TAG} Wolves`;
  let newTeamId = "";
  let gameId = "";

  test.beforeAll(async ({ browser }) => {
    sa = await signedInAs(browser, "superAdmin");
    saErrors = watchErrors(sa.page);
    const s = await stagingSql<{ id: string }>(`select id from seasons where name = $1 and deleted_at is null limit 1`, [SEASON_NAME]);
    seasonId = s[0]?.id ?? "";
    const d = await stagingSql<{ id: string }>(`select id from divisions where season_id = $1 and deleted_at is null limit 1`, [seasonId]);
    divisionId = d[0]?.id ?? "";
  });
  test.afterAll(async () => {
    console.log(`[J10] RUN_TAG=${RUN_TAG} venue="${venueName}" team="${teamName}" teamId=${newTeamId} gameId=${gameId}`);
    console.log(`[J10] superadmin errors:\n  ${saErrors.join("\n  ")}`);
    await sa?.context.close();
  });

  test("J10 journey: venues → generate → publish → captain/player", async ({ browser }) => {
  await test.step("1 · venues: discoverable, create venue + surface + ice slot (UC-06 precondition)", async () => {
    const { page, app } = sa;
    await page.goto(`${app}/dashboard`);
    // Entry point from the sidebar, not URL typing.
    const navLink = page.locator('a[href="/venues"]').first();
    expect.soft(await navLink.count(), "Venues link in sidebar").toBeGreaterThan(0);
    const navVisible = await navLink.isVisible().catch(() => false);
    console.log(`[J10] sidebar Venues link visible without expanding a group: ${navVisible}`);
    if (navVisible) await navLink.click();
    else await page.goto(`${app}/venues`);
    await expect(page.getByRole("heading", { name: /Rinks & ice time/i })).toBeVisible();

    // SCH-9: opening the form before the org list loads leaves orgId = ""
    // forever (Create stays disabled while the select shows an org). Probe
    // that race first, then reopen after the page settles like a patient user.
    await page.getByRole("button", { name: /Add venue/i }).first().click();
    await page.getByLabel("Rink name").fill(venueName);
    await page.waitForLoadState("networkidle").catch(() => {});
    const raceEnabled = await page.getByRole("button", { name: /^Create$/ }).isEnabled();
    const raceOrg = page.getByLabel("Organization");
    const raceShown = (await raceOrg.count())
      ? await raceOrg.evaluate((el: HTMLSelectElement) => (el.value ? el.options[el.selectedIndex]?.text ?? "" : ""))
      : "single org";
    console.log(`[J10] venue Create enabled after early open + name filled: ${raceEnabled} (org shown: "${raceShown}")`);
    // SCH-9: Create must agree with what the form shows. SETUP-16: with
    // several orgs none is preselected, so Create waits for a pick.
    expect.soft(raceEnabled, "SCH-9 Create state matches the org shown").toBe(raceShown !== "");
    await page.getByRole("button", { name: /^Cancel$/ }).first().click();
    await page.getByRole("button", { name: /Add venue/i }).first().click();
    await page.getByLabel("Rink name").fill(venueName);
    // Time zone is a picker of real zones (SCH-3), not free text.
    await page.getByLabel("Timezone").selectOption("America/New_York");
    const org = page.getByLabel("Organization");
    if (await org.count()) {
      const shownOrg = await org.evaluate((el: HTMLSelectElement) => (el.value ? el.options[el.selectedIndex]?.text ?? "" : ""));
      const createEnabled = await page.getByRole("button", { name: /^Create$/ }).isEnabled();
      console.log(`[J10] venue form default org="${shownOrg}" createEnabledBeforeOrgPick=${createEnabled}`);
      expect.soft(shownOrg, "SETUP-16 no organization preselected when there are several").toBe("");
      expect.soft(createEnabled, "SCH-9 Create waits for the org pick").toBe(false);
      await org.selectOption({ label: "PPHL Staging" });
      expect.soft(await page.getByRole("button", { name: /^Create$/ }).isEnabled(), "Create enabled once an org is picked").toBe(true);
    }
    await page.getByRole("button", { name: /^Create$/ }).click();
    // Anchored: the row's Edit / Delete buttons also carry the rink's name.
    const venueRow = page.getByRole("button", { name: new RegExp(`^${venueName}`) });
    await expect(venueRow, "new venue appears without reload").toBeVisible({ timeout: 15_000 });
    await venueRow.click();

    await page.getByRole("button", { name: /Add surface/i }).first().click();
    await page.getByLabel("Surface label").fill("Rink A");
    await page.getByRole("button", { name: /^Create( surface)?$/ }).last().click();
    // SCH-10: the venue header flips to "1 SURFACES" but the open panel
    // still says "No surfaces yet" until the row is collapsed and reopened.
    const surfaceRow = page.getByRole("button", { name: /^Rink A/ });
    await page.waitForTimeout(3000);
    const sameScreen = await surfaceRow.isVisible().catch(() => false);
    console.log(`[J10] new surface visible without reopening venue: ${sameScreen}`);
    expect.soft(sameScreen, "SCH-10 new surface appears in the open venue panel").toBe(true);
    if (!sameScreen) { await venueRow.click(); await venueRow.click(); }
    await expect(surfaceRow).toBeVisible({ timeout: 15_000 });
    await surfaceRow.click();

    // Single ice slot, two weeks out, 19:00 local.
    const d = new Date(Date.now() + 14 * 86400_000);
    const local = `${d.toISOString().slice(0, 10)}T19:00`;
    await page.getByRole("button", { name: /Single slot/i }).first().click();
    await page.getByLabel("Season", { exact: true }).selectOption({ label: SEASON_NAME });
    await page.getByLabel("Start (local)").fill(local);
    await page.getByRole("button", { name: /Create slot/i }).click();
    await page.waitForTimeout(2500);
    await shot(page, "01-venue-slot");

    const slots = await stagingSql<{ id: string; season_id: string | null; is_playoff_reservation: boolean }>(
      `select s.id, s.season_id, s.is_playoff_reservation from ice_slots s join surfaces f on f.id = s.surface_id join venues v on v.id = f.venue_id where v.name = $1`,
      [venueName]
    );
    expect(slots.length, "ice slot row persisted").toBeGreaterThan(0);
    // SCH-2: the scheduler reads ice_slots WHERE season_id = <season>. The
    // Venues form never sends a season, so these slots are invisible to it.
    expect.soft(slots[0]?.season_id, "SCH-2 ice slot is tied to a season").not.toBeNull();

    // SCH-3: every row can be changed and removed from the UI, and each change
    // shows on the same screen and in the stored row.
    // Rink: add its city (name and zone stay; later steps use them).
    await page.getByRole("button", { name: `Edit venue ${venueName}` }).click();
    await page.getByLabel("City").fill("Pittsburgh");
    await page.getByRole("button", { name: "Save rink" }).click();
    await expect(page.getByText(`Saved ${venueName}.`)).toBeVisible({ timeout: 15_000 });
    const [addr] = await stagingSql<{ city: string | null }>(
      `select address->>'city' as city from venues where name = $1 and deleted_at is null`, [venueName]
    );
    expect(addr?.city, "SCH-3 rink address saved").toBe("Pittsburgh");
    // Surface: rename Rink A -> Rink 1 (step 5 books "Rink 1").
    await page.getByRole("button", { name: "Rename surface Rink A" }).click();
    await page.getByLabel("Surface label").fill("Rink 1");
    await page.getByRole("button", { name: "Save surface" }).click();
    await expect(page.getByRole("button", { name: "Rename surface Rink 1" }), "SCH-3 surface renamed in place").toBeVisible({ timeout: 15_000 });
    // Slot: lengthen the single slot to 75 minutes.
    await page.getByRole("button", { name: /^Edit slot / }).first().click();
    await page.getByLabel("Duration (min)").fill("75");
    await page.getByRole("button", { name: "Save slot" }).click();
    await expect(page.getByText("· 75min").first(), "SCH-3 slot edited in place").toBeVisible({ timeout: 15_000 });
    const [len] = await stagingSql<{ duration_min: number }>(
      `select s.duration_min from ice_slots s join surfaces f on f.id = s.surface_id join venues v on v.id = f.venue_id where v.name = $1`, [venueName]
    );
    expect(len?.duration_min, "SCH-3 slot length stored").toBe(75);
    // Removal: a mistyped rink with nothing booked is deleted outright after
    // the confirm step says what will happen.
    const typo = `${RUN_TAG} Typo Rink`;
    await page.getByRole("button", { name: /Add venue/i }).first().click();
    await page.getByLabel("Rink name").fill(typo);
    if (await page.getByLabel("Organization").count()) await page.getByLabel("Organization").selectOption({ label: "PPHL Staging" });
    await page.getByLabel("Timezone").selectOption("America/New_York");
    await page.getByRole("button", { name: /^Create$/ }).click();
    await page.getByRole("button", { name: `Delete venue ${typo}` }).click();
    await expect(page.getByText(/will be deleted/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Delete rink" }).click();
    await expect(page.getByText(`${typo} deleted.`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: `Delete venue ${typo}` }), "SCH-3 deleted rink leaves the list").toHaveCount(0);
    const [gone] = await stagingSql<{ n: number }>(`select count(*)::int n from venues where name = $1`, [typo]);
    expect(gone?.n, "SCH-3 unused rink row deleted").toBe(0);
    await shot(page, "01-venue-edited");
  });

  await test.step("2 · team creation for a second division team (UC-06 precondition)", async () => {
    const { page, app } = sa;
    await page.goto(`${app}/teams`);
    await page.getByRole("link", { name: /New team/i }).click();
    newTeamId = await createTeamViaUi(page, teamName, "j10");
    await expect(page.getByText(teamName).first()).toBeVisible();
    await shot(page, "02-team-created");

    // SCH-4: the admin puts the new team into the season's division from
    // the division page (Add a team), and the entry is written.
    const before = await stagingSql<{ n: number }>(`select count(*)::int n from division_team_entries where division_id = $1 and left_at is null and entry_status in ('applied','accepted','confirmed')`, [divisionId]);
    await page.goto(`${app}/divisions/${divisionId}`);
    await page.getByRole("button", { name: "Add a team" }).click();
    await page.getByLabel("Search teams").fill(teamName.slice(0, 6));
    await page.getByRole("option", { name: teamName }).click();
    await page.getByRole("button", { name: "Add to division" }).click();
    await expect(page.getByText(`${teamName} is now in`)).toBeVisible({ timeout: 20_000 });
    // Same surface, no reload: the team is listed in the division.
    await expect(page.getByRole("link", { name: teamName }).first()).toBeVisible({ timeout: 20_000 });
    const [entry] = await stagingSql<{ entry_status: string }>(
      `select entry_status from division_team_entries where division_id = $1 and team_id = $2 and left_at is null`,
      [divisionId, newTeamId]
    );
    expect(entry?.entry_status, "SCH-4 admin placed the team: entry accepted").toBe("accepted");
    const after = await stagingSql<{ n: number }>(`select count(*)::int n from division_team_entries where division_id = $1 and left_at is null and entry_status in ('applied','accepted','confirmed')`, [divisionId]);
    console.log(`[J10] teams entered in staging division: ${before[0]?.n} -> ${after[0]?.n}`);
  });

  await test.step("3 · generate schedule for the season (UC-06)", async () => {
    const { page, app } = sa;
    await page.goto(`${app}/dashboard`);
    const navLink = page.getByRole("link", { name: /^Schedul/i }).first();
    if (await navLink.isVisible().catch(() => false)) await navLink.click();
    else await page.goto(`${app}/scheduling`);
    await page.getByRole("row", { name: new RegExp(SEASON_NAME) }).getByRole("link", { name: /Generate/i }).click();
    await expect(page.getByRole("heading", { name: /Generate/ })).toBeVisible();
    // Division picker is a dropdown of real divisions.
    await expect(page.getByRole("combobox", { name: "Division" })).toBeVisible();

    const result = await edgeCall(page, "scheduler-generate", () => page.getByRole("button", { name: /^Generate$/ }).click());
    console.log(`[J10] scheduler-generate → ${result}`);
    await page.waitForTimeout(2000);
    await shot(page, "03-generate");
    const visible = (await page.locator("main").innerText()).slice(0, 1500);
    console.log(`[J10] generate screen: ${visible.replace(/\s+/g, " ").slice(0, 600)}`);
    // SCH-1: all scheduler Edge Functions return 404 on staging.
    expect.soft(result, "SCH-1 scheduler-generate reachable").toMatch(/^http 2\d\d/);
    expect.soft(visible, "SCH-1 readable error").not.toMatch(/Failed to send a request to the Edge Function/);
  });

  await test.step("4 · every scheduling tab loads (runs, conflicts, fairness, verify, playoffs, tournament, parity, notifications)", async () => {
    const { page, app } = sa;
    const failures: string[] = [];
    for (const tab of ["runs", "conflicts", "fairness", "verify", "playoffs", "tournament", "parity", "rinks"]) {
      await page.goto(`${app}/scheduling/${seasonId}/${tab}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1500);
      const text = await page.locator("main").innerText();
      if (/Load failed|Failed to send a request|Request failed/i.test(text)) failures.push(`${tab}: ${text.match(/(Load failed|Failed to send[^\n]*|Request failed)/i)?.[0]}`);
      await shot(page, `04-tab-${tab}`);
    }
    // Playoffs: generate bracket (UC-09). Needs playoff-reserved slots which the
    // Venues UI cannot create (no is_playoff_reservation field).
    await page.goto(`${app}/scheduling/${seasonId}/playoffs`);
    const gen = page.getByRole("button", { name: /Generate( bracket)?/i }).first();
    if (await gen.isVisible().catch(() => false)) {
      const r = await edgeCall(page, "scheduler-bracket-generate", () => gen.click());
      console.log(`[J10] bracket generate → ${r}`);
      if (!/^http 2/.test(r)) failures.push(`playoffs generate: ${r}`);
    } else failures.push("playoffs: no Generate bracket button visible");
    console.log(`[J10] tab failures:\n  ${failures.join("\n  ")}`);
    expect.soft(failures, "SCH-1 scheduling tabs load").toEqual([]);
  });

  await test.step("5 · manual game creation + override fallback (UC-07)", async () => {
    const { page, app } = sa;
    await page.goto(`${app}/games`);
    const newGame = page.getByRole("button", { name: /New game/i }).first();
    await expect(newGame, "New game enabled once 2 teams exist").toBeEnabled({ timeout: 15_000 });
    await newGame.click();
    const dlg = page.getByRole("dialog");
    // SCH-5: no free-text venue or zone; league -> season -> division pickers.
    await expect(dlg.locator("input#venueName"), "SCH-5 venue is not free text").toHaveCount(0);
    await expect(dlg.locator("input#tz"), "SCH-5 time zone is not free text").toHaveCount(0);
    const d = new Date(Date.now() + 10 * 86400_000);
    await scheduleGame(page, {
      league: "PPHL Staging League",
      season: SEASON_NAME,
      divisionId,
      away: teamName,
      home: BASE_TEAM,
      rink: `${venueName} · Rink 1`,
      startLocal: `${d.toISOString().slice(0, 10)}T20:00`,
      tag: "J10"
    });
    const g = await stagingSql<{ id: string; season_id: string | null; division_id: string | null; published_at: string | null; slot_id: string | null }>(
      `select id, season_id, division_id, published_at, slot_id from games where (home_team_id = $1 or away_team_id = $1) order by created_at desc limit 1`, [newTeamId]
    );
    gameId = g[0]?.id ?? "";
    expect(gameId, "manual game persisted").not.toBe("");
    expect(g[0]?.season_id, "SCH-5 manual game carries the season").toBe(seasonId);
    expect(g[0]?.division_id, "SCH-5 manual game carries the division").toBe(divisionId);
    const [placed] = await stagingSql<{ tz: string; venue_name: string | null; surface_label: string | null; surface_id: string | null }>(
      `select tz, venue_name, surface_label, surface_id from games where id = $1`, [gameId]
    );
    expect(placed?.surface_id, "SCH-5 manual game is on a real rink").toBeTruthy();
    expect([placed?.venue_name, placed?.surface_label, placed?.tz], "SCH-5 rink names and zone come from the rink").toEqual([venueName, "Rink 1", "America/New_York"]);
    // Same-screen refresh: game row visible without reload.
    await expect.soft(page.getByRole("link", { name: /Wolves|Skaters/ }).first()).toBeVisible();
    await shot(page, "05-manual-game");

    // SCH-7: "Show on team schedules now" is on by default, so the game is
    // published at creation and both teams are queued a notice.
    expect(g[0]?.published_at, "SCH-7 manual game published at creation").not.toBeNull();
    const scheduledNotices = await stagingSql<{ n: number }>(
      `select count(*)::int n from notifications where idempotency_key like $1 and recipient_person_id is not null`,
      [`game.scheduled:${gameId}%`]
    );
    expect(scheduledNotices[0]?.n ?? 0, "SCH-7 game.scheduled notices queued per person").toBeGreaterThan(0);

    // UC-07 / SCH-6: move the game one hour later on the game detail page.
    await page.goto(`${app}/games/${gameId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "05-game-detail");
    await page.getByRole("button", { name: /^Reschedule$/ }).click();
    const mv = page.getByRole("dialog");
    const startInput = mv.getByLabel("Date and time");
    const current = await startInput.inputValue();
    const later = `${current.slice(0, 11)}${String((Number(current.slice(11, 13)) + 1) % 24).padStart(2, "0")}${current.slice(13)}`;
    await startInput.fill(later);
    const moveResp = page.waitForResponse((r) => r.url().includes(`/games/${gameId}/reschedule`) && r.request().method() === "POST", { timeout: 30_000 });
    const previewResp = page.waitForResponse((r) => r.url().includes(`/games/${gameId}/reschedule-preview`), { timeout: 30_000 });
    await mv.getByRole("button", { name: /^Move game$/ }).click();
    await previewResp;
    // Staging is shared: if another run already booked Staging Skaters at
    // that hour, the dialog lists the clash; override it with a reason the
    // way an admin would (UC-07 force override).
    if (await mv.getByText(/This move clashes/).isVisible().catch(() => false)) {
      console.log(`[J10] reschedule clash: ${(await mv.innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
      await mv.getByLabel("Reason").fill(`${RUN_TAG} J10 override`);
      await mv.getByRole("button", { name: /^Move anyway$/ }).click();
    }
    const mr = await moveResp;
    expect(mr.status(), "SCH-6 reschedule accepted").toBeLessThan(400);
    await expect(mv).toBeHidden({ timeout: 20_000 });
    // Same-screen refresh: the move shows without a reload.
    await expect(page.getByText(/Moved from/).first(), "SCH-6 game page shows the move").toBeVisible({ timeout: 20_000 });
    const moved = await stagingSql<{ start: string; locked_at: string | null; moves: number }>(
      `select scheduled_start_ts_utc as start, locked_at, jsonb_array_length(coalesce(metadata->'reschedules','[]'::jsonb))::int moves from games where id = $1`,
      [gameId]
    );
    console.log(`[J10] after reschedule: ${JSON.stringify(moved[0])}`);
    expect(moved[0]?.moves, "SCH-6 move recorded on the game").toBe(1);
    expect(moved[0]?.locked_at, "SCH-6 moved game pinned against the scheduler").toBeTruthy();
    const movedNotices = await stagingSql<{ n: number }>(
      `select count(*)::int n from notifications where idempotency_key like $1`,
      [`game.rescheduled:${gameId}%`]
    );
    expect(movedNotices[0]?.n ?? 0, "SCH-6 game.rescheduled notices queued").toBeGreaterThan(0);
    await shot(page, "05-game-rescheduled");
  });

  await test.step("6 · captain and player see the scheduled game (UC-08 destination)", async () => {
    if (!gameId) { console.log("[J10] step 6 blocked: no game"); return; }
    const cap = await signedInAs(browser, "teamAdmin");
    const capErr = watchErrors(cap.page);
    await cap.page.goto(`${cap.app}/`);
    const capNav = cap.page.getByRole("link", { name: /^Schedule$/i }).first();
    if (await capNav.isVisible().catch(() => false)) await capNav.click(); else await cap.page.goto(`${cap.app}/schedule`);
    await cap.page.waitForLoadState("networkidle").catch(() => {});
    const capText = await cap.page.locator("main").innerText();
    await cap.page.screenshot({ path: `${OUTPUT_DIR}/j10/06-captain-schedule.png`, fullPage: true });
    expect(capText, "SCH-7 captain /schedule lists the game vs the new team").toContain(RUN_TAG);
    // Lineups and schedule now read the same server rule (drafts never reach captains).
    await cap.page.goto(`${cap.app}/lineups`);
    const lineupsText = await cap.page.locator("main").innerText();
    console.log(`[J10] captain /lineups contains game: ${lineupsText.includes(RUN_TAG) || lineupsText.includes("Wolves")}`);
    console.log(`[J10] captain errors: ${capErr.join(" | ")}`);
    await cap.context.close();

    const pl = await signedInAs(browser, "player");
    const plErr = watchErrors(pl.page);
    await pl.page.goto(`${pl.app}/schedule`);
    await pl.page.waitForLoadState("networkidle").catch(() => {});
    const plText = await pl.page.locator("main").innerText();
    await pl.page.screenshot({ path: `${OUTPUT_DIR}/j10/06-player-schedule.png`, fullPage: true });
    expect(plText, "SCH-7 player /schedule lists the game").toContain(RUN_TAG);
    // iCal export exists on player schedule (download only, no subscribe URL).
    const ical = pl.page.getByRole("button", { name: /calendar|ical|\.ics/i });
    console.log(`[J10] player iCal buttons: ${await ical.count()}`);
    await pl.page.goto(`${pl.app}/notifications`);
    await pl.page.waitForLoadState("networkidle").catch(() => {});
    const nText = await pl.page.locator("main").innerText();
    await pl.page.screenshot({ path: `${OUTPUT_DIR}/j10/06-player-notifications.png`, fullPage: true });
    expect.soft(nText, "SCH-8 player gets a schedule notification (UC-08/UC-21)").not.toMatch(/all caught up|No notifications yet/i);
    console.log(`[J10] player errors: ${plErr.join(" | ")}`);
    await pl.context.close();
  });

  await test.step("7 · org-admin scheduling parity (same feature, role-filtered)", async () => {
    const oa = await signedInAs(browser, "orgAdmin");
    const errs = watchErrors(oa.page);
    await oa.page.goto(`${oa.app}/`);
    const nav = oa.page.getByRole("link", { name: /^Schedul/i }).first();
    expect.soft(await nav.count(), "org-admin sidebar has Scheduling").toBeGreaterThan(0);
    await oa.page.goto(`${oa.app}/scheduling`);
    await expect.soft(oa.page.getByText(SEASON_NAME).first()).toBeVisible();
    await oa.page.goto(`${oa.app}/scheduling/${seasonId}/generate`);
    const r = await edgeCall(oa.page, "scheduler-generate", () => oa.page.getByRole("button", { name: /^Generate$/ }).click());
    console.log(`[J10] org-admin scheduler-generate → ${r}`);
    await oa.page.screenshot({ path: `${OUTPUT_DIR}/j10/07-org-generate.png`, fullPage: true });
    await oa.page.goto(`${oa.app}/venues`);
    await oa.page.waitForLoadState("networkidle").catch(() => {});
    await oa.page.waitForTimeout(2000);
    const vText = await oa.page.locator("main").innerText();
    await oa.page.screenshot({ path: `${OUTPUT_DIR}/j10/07-org-venues.png`, fullPage: true });
    console.log(`[J10] org-admin /venues: ${vText.replace(/\s+/g, " ").slice(0, 300)}`);
    expect.soft(vText, "org-admin /venues lists the venue super_admin created in this org").toContain(venueName);
    console.log(`[J10] org-admin errors: ${errs.join(" | ")}`);
    await oa.context.close();
  });

  await test.step("8 · captain cannot reach scheduling (RBAC)", async () => {
    const cap = await signedInAs(browser, "teamAdmin");
    await cap.page.goto(`${cap.app}/`);
    expect(await cap.page.getByRole("link", { name: /^Scheduling$/i }).count()).toBe(0);
    await cap.context.close();
  });
  });
});
