import { openNav, stagingDbUrl } from "./_helpers";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
// NOTE: ./_helpers imports "../../playwright.config", which resolves to
// tests/playwright.config and fails to load (SETUP-1). Until that is
// fixed centrally this file carries the few helpers it needs.
import { BYPASS_STATE_PATH } from "../../../playwright.config";

/**
 * J1 · Org, league, season, division setup (doc/testing/pphl-journey-matrix.md)
 *
 * super_admin @ superadmin-web builds a PPHL-like structure tagged with
 * RUN_TAG: org → league → season (dates, registration window, roster
 * lock) → 2 divisions → 2 teams, then tries to edit each one, then
 * walks the season status dropdown. org_admin @ org-admin-web then
 * builds a league inside the staging org and super_admin confirms it.
 *
 * STAGING ONLY — it creates rows.
 */

const IS_STAGING = process.env.E2E_TARGET === "staging";
const RUN_TAG = process.env.E2E_RUN_TAG ?? `E2E${Date.now().toString(36).toUpperCase()}`;
const tag = RUN_TAG.toLowerCase();

const SA = E2E_URLS.superadmin;
const OA = E2E_URLS.orgAdmin;

type R = "superAdmin" | "orgAdmin";
async function signedIn(browser: Browser, role: R, app: string) {
  const context = await browser.newContext(
    existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {}
  );
  const page = await context.newPage();
  await signIn(page, app, SMOKE_USERS[role]);
  return { context, page };
}

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  return errors;
}

/** Wizard <Field> labels are not linked to their controls, so find the
 * control that follows the label text. */
function wizardField(page: Page, label: string) {
  return page
    .locator(
      `xpath=//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea]`
    )
    .first();
}

let sqlClient: ((q: string, p?: unknown[]) => Promise<any[]>) | null = null;
async function stagingSql(q: string, p: unknown[] = [], attempt = 0): Promise<any[]> {
  if (!IS_STAGING) throw new Error("staging only");
  if (!sqlClient) {
    const { createRequire } = await import("node:module");
    const { readFileSync } = await import("node:fs");
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

function ymd(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const ORG_NAME = `PPHL ${RUN_TAG}`;
const LEAGUE_NAME = `PPHL League ${RUN_TAG}`;
const SEASON_NAME = `Winter ${RUN_TAG}`;
const DIV_A = `Div A ${RUN_TAG}`;
const DIV_B = `Div B ${RUN_TAG}`;
const TEAM_1 = `Blades ${RUN_TAG}`;
const TEAM_2 = `Pucks ${RUN_TAG}`;
const OA_LEAGUE = `OA League ${RUN_TAG}`;
const OA_SEASON = `OA Season ${RUN_TAG}`;
const OA_DIV = `OA Div ${RUN_TAG}`;

/**
 * Bug checks are collected rather than thrown so a serial journey keeps
 * walking past a known bug; the final test fails listing every finding.
 */
const findings: string[] = [];
async function softly(fn: () => void | Promise<void>) {
  try {
    await fn();
  } catch (e) {
    const msg = (e as Error).message.split("\n").slice(0, 6).join(" | ");
    findings.push(msg);
    console.log(`[J1 finding] ${msg}`);
  }
}

const ids: { org?: string; league?: string; season?: string; oaLeague?: string } = {};

async function walkWizard(
  page: Page,
  opts: { orgName: string | null; league: string; season: string; divisions: string[] }
) {
  // Step 1 — organisation
  await expect(page.getByRole("heading", { name: "Pick the organisation." })).toBeVisible();
  if (opts.orgName) {
    await page.getByRole("button", { name: new RegExp(opts.orgName) }).click();
  }
  await page.getByRole("button", { name: "Next: League" }).click();

  // Step 2 — league
  await expect(page.getByRole("heading", { name: "Frame the league." })).toBeVisible();
  const sport = wizardField(page, "Sport");
  const defaultSport = await sport.locator("option:checked").textContent();
  // CLAUDE.md "defaults must reflect context": the org's own sport, or an
  // empty choice for an org with no leagues yet, never alphabetical-first.
  await softly(async () => expect(defaultSport, "SETUP-3: wizard Sport defaults to the alphabetically first sport").toMatch(/hockey|Pick a sport/i));
  await wizardField(page, "League name").fill(opts.league);
  await sport.selectOption({ label: "Ice Hockey" });
  await page.getByRole("button", { name: "Next: Season" }).click();

  // Step 3 — season
  await expect(page.getByRole("heading", { name: "Open the season." })).toBeVisible();
  await wizardField(page, "Season name").fill(opts.season);
  await wizardField(page, "Season start date").fill(ymd(14));
  await wizardField(page, "Season end date").fill(ymd(180));
  await wizardField(page, "Registration opens").fill(ymd(1));
  await wizardField(page, "Registration closes").fill(ymd(10));
  await wizardField(page, "Roster lock date").fill(ymd(30));
  await page.getByRole("button", { name: "Next: Divisions" }).click();

  // Step 4 — divisions
  await expect(page.getByRole("heading", { name: "Carve the divisions." })).toBeVisible();
  for (let i = 0; i < opts.divisions.length; i++) {
    if (i > 0) {
      await page.getByRole("button", { name: /add (another )?division/i }).click();
      // The new card is added collapsed; the admin has to expand it to type a name.
      const expand = page.getByRole("button", { name: "Expand" }).last();
      const collapsed = await expand.count();
      await softly(async () =>
        expect(collapsed, "SETUP-5: 'Add another division' adds a collapsed card with no name field visible").toBe(0)
      );
      if (collapsed) await expand.click();
    }
    await page
      .locator(`xpath=(//label[starts-with(normalize-space(.), "Division name")]/following-sibling::*[1]/descendant-or-self::input)[${i + 1}]`)
      .fill(opts.divisions[i]!);
  }
}

test.describe.serial("J1 · org/league/season/division setup", () => {
  test.skip(!IS_STAGING, "mutating journey — staging only");
  test.setTimeout(180_000);

  let sa: { context: BrowserContext; page: Page };
  let saErrors: string[];

  test.beforeAll(async ({ browser }) => {
    sa = await signedIn(browser, "superAdmin", SA);
    saErrors = watch(sa.page);
  });
  test.afterAll(async () => {
    console.log(`[J1] RUN_TAG=${RUN_TAG} ids=${JSON.stringify(ids)}`);
    console.log(`[J1] super_admin errors:\n${saErrors.join("\n")}`);
    await sa?.context.close();
  });

  test("1. super_admin creates an organization from /organizations", async () => {
    const page = sa.page;
    await page.goto(`${SA}/dashboard`);
    await openNav(page, /^Organizations$/);
    await expect(page.getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "New organization" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#displayName").fill(ORG_NAME);
    await dialog.locator("#legalName").fill(`${ORG_NAME} Inc.`);
    // Slug is not derived from the display name (the wizard does derive it).
    const slugBefore = await dialog.locator("#slug").inputValue();
    await softly(async () => expect(slugBefore, "SETUP-11: org slug is not auto-derived from display name").not.toBe(""));
    await dialog.locator("#slug").fill(`pphl-${tag}`);
    await dialog.locator("#orgType").selectOption("league_operator");
    await dialog.getByRole("button", { name: "Create organization" }).click();
    // Since 24 Oct the create flow continues into "Choose the org admin"
    // (SP-Changes blocker 1). J1 assigns admins later; close it here.
    await expect(page.getByRole("heading", { name: "Choose the org admin" })).toBeVisible({ timeout: 15_000 });
    // The named close control is the full-screen backdrop; click a corner outside the panel.
    await page.getByRole("button", { name: "Close dialog" }).click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
    // Same-surface refresh: row appears without manual reload.
    await expect(page.getByRole("link", { name: ORG_NAME })).toBeVisible({ timeout: 15_000 });
    const [row] = await stagingSql(
      "select id, display_name, org_type, status from orgs where slug = $1",
      [`pphl-${tag}`]
    );
    expect(row?.display_name).toBe(ORG_NAME);
    ids.org = row.id;
  });

  test("2. super_admin runs the 4-step Org setup wizard (league, season, 2 divisions)", async () => {
    const page = sa.page;
    await openNav(page, /^Set up a season$/);
    await walkWizard(page, { orgName: ORG_NAME, league: LEAGUE_NAME, season: SEASON_NAME, divisions: [DIV_A, DIV_B] });
    await page.getByRole("button", { name: "Publish league" }).click();
    await page.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 30_000 });
    ids.league = page.url().split("/leagues/")[1]!.split(/[?#]/)[0];
    await expect(page.getByRole("heading", { name: LEAGUE_NAME })).toBeVisible();
    await expect(page.getByText(SEASON_NAME).first()).toBeVisible();

    const leagues = await stagingSql(
      "select l.id, l.status, l.sport_code, l.org_id from leagues l where l.id = $1",
      [ids.league]
    );
    expect(leagues[0]?.org_id).toBe(ids.org);
    expect(leagues[0]?.status).toBe("active");
    const seasons = await stagingSql(
      "select id, status, start_date, end_date, registration_opens_at, registration_closes_at, roster_lock_at from seasons where league_id = $1",
      [ids.league]
    );
    expect(seasons).toHaveLength(1);
    ids.season = seasons[0].id;
    expect(seasons[0].roster_lock_at).not.toBeNull();
    const divs = await stagingSql("select name from divisions where season_id = $1 order by name", [ids.season]);
    expect(divs.map((d) => d.name)).toEqual([DIV_A, DIV_B]);
  });

  test("3. leagues / seasons / divisions lists show the new rows", async () => {
    const page = sa.page;
    // The list pages fetch one page (API default limit 25, ordered by
    // uuid) with no "load more", so a new row can be missing (SETUP-14).
    for (const [path, name, table] of [
      ["/leagues", LEAGUE_NAME, "leagues"],
      ["/seasons", SEASON_NAME, "seasons"],
      ["/divisions", DIV_A, "divisions"],
      ["/divisions", DIV_B, "divisions"]
    ] as const) {
      await page.goto(`${SA}${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const shown = await page.getByRole("link", { name, exact: true }).count();
      const rendered = await page.locator("main table tbody tr").count();
      const [{ n }] = await stagingSql(`select count(*)::int n from ${table}`);
      console.log(`[J1] ${path}: rows rendered=${rendered}, rows in db=${n}, new row shown=${shown}`);
      await softly(async () =>
        expect(shown, `SETUP-14: ${path} renders ${rendered} of ${n} rows; new row '${name}' missing (no pagination)`).toBe(1)
      );
    }
    await page.goto(`${SA}/divisions?seasonId=${ids.season}`);
    const divRow = page.getByRole("row", { name: new RegExp(DIV_A) });
    await expect(divRow).toBeVisible();
    // The wizard default maxTeams is 10; the list should show it.
    await softly(async () => expect(divRow, "SETUP-12: divisions list Max teams column shows the saved maxTeams").toContainText("10"));
  });

  test("4. super_admin creates 2 teams from /teams/new", async () => {
    const page = sa.page;
    // Team 1: Home rink left blank (it is labelled Optional).
    // Team 2: Home rink filled, to isolate the blank-rink failure.
    for (const [name, rink] of [[TEAM_1, ""], [TEAM_2, `Rink ${RUN_TAG}`]] as const) {
      await page.goto(`${SA}/teams`);
      await page.getByRole("link", { name: "New team" }).first().click();
      await expect(page.getByRole("heading", { name: "Create team" })).toBeVisible();
      const sport = page.getByRole("combobox", { name: "Sport *" });
      const sportDefault = await sport.locator("option:checked").textContent();
      await softly(async () => expect(sportDefault, "SETUP-3: team Sport defaults to first alphabetical sport, not the org's sport").toMatch(/hockey/i));
      await page.getByRole("combobox", { name: "Organisation *" }).selectOption({ label: ORG_NAME });
      await page.getByRole("textbox", { name: "Team name *" }).fill(name);
      if (rink) await page.getByRole("textbox", { name: "Home rink" }).fill(rink);
      await sport.selectOption({ label: "Ice Hockey" });
      const resp = page.waitForResponse((r) => r.url().endsWith("/league/teams") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Create team" }).click();
      const status = (await resp).status();
      console.log(`[J1] POST /league/teams (homeRink=${rink ? "set" : "blank"}) -> ${status}`);
      await softly(async () =>
        expect(status, `SETUP-6: Create team with ${rink ? "a" : "a blank"} Home rink returns ${status}`).toBeLessThan(300)
      );
      if (status < 300) {
        await page.waitForURL(/\/teams\/[0-9a-f-]{36}/, { timeout: 30_000 });
        await expect(page.getByText(name).first()).toBeVisible();
      } else {
        console.log(`[J1] visible error: ${await page.locator("main").getByText(/error|could not/i).first().textContent()}`);
        // Did the 500 still leave a team row behind?
        const orphan = await stagingSql("select id from teams where org_id=$1 and name=$2", [ids.org, name]);
        console.log(`[J1] team rows after failed create: ${orphan.length}`);
        // Retry like a real admin would.
        await page.getByRole("button", { name: "Create team" }).click();
        await page.waitForTimeout(3000);
        console.log(`[J1] retry visible text: ${await page.locator("main").getByText(/already exists|error/i).first().textContent({ timeout: 5_000 }).catch(() => "none")}`);
      }
    }
    const teams = await stagingSql("select name, sport_code from teams where org_id = $1 order by name", [ids.org]);
    expect(teams.map((t) => t.name)).toEqual([TEAM_1, TEAM_2]);
  });

  test("5. edit after creation: league, season, division, team, org", async () => {
    const page = sa.page;
    // League: "Edit league" edits this league in place, prefilled (SETUP-2,
    // fixed in 16b975d; the old "Edit in Org setup" link opened a blank wizard).
    await page.goto(`${SA}/leagues/${ids.league}`);
    const editLeague = page.getByRole("button", { name: "Edit league" });
    await expect(editLeague).toBeVisible();
    await editLeague.click();
    const nameField = page.getByLabel("League name", { exact: true });
    await softly(async () => expect(
      { url: page.url().includes(`/leagues/${ids.league}`), prefilled: await nameField.inputValue().catch(() => "") },
      "SETUP-2: Edit league opens an editor for THIS league, prefilled"
    ).toEqual({ url: true, prefilled: LEAGUE_NAME }));
    await page.keyboard.press("Escape");

    // Season: no rename / date edit on the detail page.
    await page.goto(`${SA}/seasons/${ids.season}`);
    await expect(page.getByText(SEASON_NAME).first()).toBeVisible();
    const seasonEdit =
      (await page.getByRole("button", { name: /edit|rename|change dates/i }).count()) +
      (await page.getByRole("link", { name: /edit/i }).count());
    await softly(async () => expect(seasonEdit, "SETUP-2: season detail has no edit affordance for name/dates/roster lock").toBeGreaterThan(0));

    // Division
    const [div] = await stagingSql("select id from divisions where season_id=$1 and name=$2", [ids.season, DIV_A]);
    await page.goto(`${SA}/divisions/${div.id}`);
    await expect(page.getByText(DIV_A).first()).toBeVisible();
    const divEdit = page.getByRole("link", { name: /Edit in Org setup/ });
    if (await divEdit.count()) {
      await divEdit.click();
      await page.waitForLoadState("networkidle");
      const blank = /\/org-setup/.test(page.url()) && (await page.getByText(DIV_A).count()) === 0;
      await softly(async () => expect(blank, "SETUP-2: division 'Edit in Org setup' opens the blank create wizard").toBe(false));
    }

    // Team
    const [team] = await stagingSql("select id from teams where org_id=$1 and name=$2", [ids.org, TEAM_2]);
    await page.goto(`${SA}/teams/${team.id}`);
    await expect(page.getByText(TEAM_2).first()).toBeVisible();
    const teamEdit =
      (await page.getByRole("button", { name: /edit|rename/i }).count()) +
      (await page.getByRole("link", { name: /^edit/i }).count());
    await softly(async () => expect(teamEdit, "SETUP-2: team detail has no edit affordance on superadmin-web").toBeGreaterThan(0));

    // Org
    await page.goto(`${SA}/organizations/${ids.org}`);
    await expect(page.getByText(ORG_NAME).first()).toBeVisible();
    const orgEdit = await page.getByRole("button", { name: /edit|rename/i }).count();
    await softly(async () => expect(orgEdit, "SETUP-2: organization detail has no edit affordance").toBeGreaterThan(0));
  });

  test("5b. add a second season to the existing league (next year's rollover)", async () => {
    const page = sa.page;
    await page.goto(`${SA}/seasons`);
    await page.getByRole("link", { name: /New season/ }).first().click();
    await page.waitForURL(/\/org-setup/);
    await page.getByRole("button", { name: new RegExp(ORG_NAME) }).click();
    await page.getByRole("button", { name: "Next: League" }).click();
    // A "New season" entry point must let the admin pick the existing league:
    // step 2 offers "Add to an existing league", then a League list.
    await page.getByRole("button", { name: "Add to an existing league" }).click();
    const leaguePicker = page.getByLabel("League", { exact: true });
    const offered = await leaguePicker.locator("option").allTextContents().catch(() => [] as string[]);
    await softly(async () =>
      expect(
        offered.includes(LEAGUE_NAME),
        "SETUP-10: 'New season -> Org setup' can only create a NEW league; no way to add a season (or division) to an existing league"
      ).toBe(true)
    );
  });

  test("6. season status dropdown: draft → registration_open → in_progress … and illegal jumps", async () => {
    const page = sa.page;
    await page.goto(`${SA}/seasons/${ids.season}`);
    const [{ status: initial }] = await stagingSql("select status from seasons where id=$1", [ids.season]);
    console.log(`[J1] season initial status=${initial}`);
    const control = page.locator("main button", { hasText: initial.replace(/_/g, " ") }).first();
    await expect(control).toBeVisible();
    await control.click();
    const options = await page.locator("main ul li button p.font-medium").allTextContents();
    console.log(`[J1] status options offered from ${initial}: ${options.join(" | ")}`);
    // Only legal transitions should be offered (domain: season-status.vo.ts).
    await softly(async () => expect(options, "SETUP-4: status menu offers transitions the server always rejects").not.toContain("Completed"));

    // From draft the menu offers only the legal moves (kernel
    // SEASON_STATUS_TRANSITIONS): registration_open and archived.
    if (initial === "draft") {
      await softly(async () =>
        expect(options.filter((o) => o !== "Draft").sort(), "draft offers only legal next statuses").toEqual(["Archived", "Registration open"])
      );
    }
    await page.keyboard.press("Escape");

    // Legal path, observing the badge change without a reload each time.
    await page.goto(`${SA}/seasons/${ids.season}`);
    let current = initial as string;
    for (const [label, value] of [
      ["Registration open", "registration_open"],
      ["In progress", "in_progress"],
      ["Playoffs", "playoffs"],
      ["Completed", "completed"]
    ] as const) {
      if (current === value) continue;
      const trigger = page.locator("main button:has(svg.lucide-chevron-down)", { hasText: current.replace(/_/g, " ") }).first();
      await trigger.click();
      const resp = page.waitForResponse((r) => /\/league\/seasons\/[^/]+\/status$/.test(r.url()) && r.request().method() === "POST");
      await page.locator("main ul li button").filter({ has: page.locator("p.font-medium", { hasText: new RegExp(`^${label}$`) }) }).click();
      const r = await resp;
      console.log(`[J1] status ${current} -> ${value}: HTTP ${r.status()}`);
      expect(r.status(), `${current} -> ${value}`).toBeLessThan(300);
      await expect(
        page.locator("main button:has(svg.lucide-chevron-down)", { hasText: value.replace(/_/g, " ") }).first(),
        `badge shows ${value} without reload`
      ).toBeVisible({ timeout: 15_000 });
      const [{ status }] = await stagingSql("select status from seasons where id=$1", [ids.season]);
      expect(status).toBe(value);
      current = value;
    }
  });

  test("7. org_admin builds a league inside the staging org; super_admin sees it", async ({ browser }) => {
    const oa = await signedIn(browser, "orgAdmin", OA);
    const oaErrors = watch(oa.page);
    try {
      const page = oa.page;
      await page.goto(`${OA}/`);
      // Discoverable entry point from the org-admin home/sidebar: any visible
      // link to /org-setup ("Start a season", "Set up a season", ...).
      const entry = page.locator("main a[href='/org-setup']:visible, nav a[href='/org-setup']:visible").first();
      await expect(entry).toBeVisible();
      await entry.click();
      await walkWizard(page, { orgName: null, league: OA_LEAGUE, season: OA_SEASON, divisions: [OA_DIV] });
      await page.getByRole("button", { name: "Publish league" }).click();
      await page.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 30_000 });
      ids.oaLeague = page.url().split("/leagues/")[1]!.split(/[?#]/)[0];
      await expect(page.getByText(OA_LEAGUE).first()).toBeVisible();

      for (const [path, name] of [["/leagues", OA_LEAGUE], ["/seasons", OA_SEASON], ["/divisions", OA_DIV]] as const) {
        await page.goto(`${OA}${path}`);
        await expect(page.getByText(name).first(), `org_admin ${path} lists ${name}`).toBeVisible();
        // org_admin must NOT see the super_admin's other org.
        await expect(page.getByText(LEAGUE_NAME)).toHaveCount(0);
      }
    } finally {
      console.log(`[J1] org_admin errors:\n${oaErrors.join("\n")}`);
      await oa.context.close();
    }

    // Destination: super_admin sees the org-admin-created rows.
    const page = sa.page;
    await page.goto(`${SA}/leagues`);
    // Wait for the table (rows stream in after load) before counting.
    await page.getByText(/Showing \d+ of \d+ leagues/).first().waitFor({ timeout: 20_000 }).catch(() => {});
    const leagueShown = await page.getByRole("link", { name: OA_LEAGUE, exact: true }).count();
    await softly(async () => expect(leagueShown, `SETUP-14: super_admin /leagues does not list '${OA_LEAGUE}' (25-row cap)`).toBe(1));
    await page.goto(`${SA}/leagues/${ids.oaLeague}`);
    await expect(page.getByText(OA_LEAGUE).first()).toBeVisible();
    await expect(page.getByText("PPHL Staging").first()).toBeVisible();
    await page.goto(`${SA}/divisions`);
    await page.getByText(/Showing \d+ of \d+ divisions/).first().waitFor({ timeout: 20_000 }).catch(() => {});
    const shown = await page.getByRole("link", { name: OA_DIV, exact: true }).count();
    await softly(async () => expect(shown, `SETUP-14: super_admin /divisions does not list '${OA_DIV}' (25-row cap)`).toBe(1));
    const [{ season_id }] = await stagingSql("select season_id from divisions where name=$1", [OA_DIV]);
    await page.goto(`${SA}/divisions?seasonId=${season_id}`);
    await expect(page.getByRole("link", { name: OA_DIV, exact: true })).toBeVisible();
  });

  test("8. venues: super_admin adds a venue for the new org", async () => {
    const page = sa.page;
    const orgName = ids.org ? ORG_NAME : "PPHL Staging";
    await page.goto(`${SA}/dashboard`);
    // Discoverability: the sidebar carries a Venues link (in a collapsible group).
    expect(await page.locator('aside a[href="/venues"]').count(), "sidebar has a Venues link").toBeGreaterThan(0);
    await page.goto(`${SA}/venues`);
    await expect(page.getByRole("heading", { name: /Rinks & ice time/ })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add venue" }).first().click();
    const orgSelect = page.getByRole("combobox", { name: "Organization" });
    const defaultOrg = await orgSelect.locator("option:checked").textContent();
    console.log(`[J1] venue form default org: ${defaultOrg}`);
    await orgSelect.selectOption({ label: orgName });
    // The form says "Rink name" and picks the zone from a list (SETUP-16).
    const name = page.getByRole("textbox", { name: "Rink name" });
    await name.fill(`Rink ${RUN_TAG}`);
    const tz = page.getByLabel("Timezone", { exact: true });
    console.log(`[J1] venue form default timezone: ${await tz.inputValue()}`);
    await softly(async () =>
      expect(await tz.inputValue(), "SETUP-16: venue timezone defaults to UTC, not the org's timezone; free-text IANA field").toBe("America/New_York")
    );
    const create = page.getByRole("button", { name: "Create", exact: true });
    const enabled = await create.isEnabled();
    console.log(`[J1] venue Create enabled after filling name=${enabled}; org now=${await orgSelect.locator("option:checked").textContent()}; name value=${await name.inputValue()}`);
    expect(enabled, "Create venue enabled once name + org are set").toBe(true);
    await create.click();
    await expect(page.getByText(`Rink ${RUN_TAG}`).first()).toBeVisible({ timeout: 15_000 });
    const rows = await stagingSql("select v.org_id, o.display_name from venues v join orgs o on o.id=v.org_id where v.name=$1", [`Rink ${RUN_TAG}`]);
    expect(rows[0]?.display_name).toBe(orgName);
  });

  test("9. no bug findings were recorded along the journey", async () => {
    expect(findings, findings.join("\n")).toEqual([]);
  });
});
