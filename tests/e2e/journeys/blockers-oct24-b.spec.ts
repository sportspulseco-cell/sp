import { test, expect, type Page } from "@playwright/test";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql } from "./_helpers";

/**
 * SP-Changes (1).pdf, PPHL 24 Oct 2026 — blockers 1, 2, 5, 6, driven in
 * the browser on staging with database readback after every save.
 */
test.skip(!IS_STAGING, "staging only");
test.describe.configure({ mode: "serial" });

const TAG = `${RUN_TAG}B2`;
const ORG_ID = "f7e62723-7685-4ba0-80e5-310c266c7b81"; // PPHL Staging
const SPORT = "HOCKEY_ICE";
const seed = { leagueId: "", seasonId: "", divisionId: "", newOrgId: "" };

function ymd(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
function logApi(page: Page, tag: string) {
  page.on("response", (r) => {
    if (r.status() >= 400 && /staging-api/.test(r.url())) console.log(`[${tag}] ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

test.beforeAll(async () => {
  const [l] = await stagingSql<{ id: string }>(
    `insert into leagues (org_id, sport_code, name, status) values ($1, $2, $3, 'active') returning id`,
    [ORG_ID, SPORT, `${TAG} League`]
  );
  seed.leagueId = l!.id;
  const [s] = await stagingSql<{ id: string }>(
    `insert into seasons (org_id, league_id, name, sport_code, start_date, end_date, status)
     values ($1, $2, $3, $4, $5, $6, 'draft') returning id`,
    [ORG_ID, seed.leagueId, `${TAG} Season`, SPORT, ymd(20), ymd(140)]
  );
  seed.seasonId = s!.id;
  const [d] = await stagingSql<{ id: string }>(
    `insert into divisions (season_id, name, tier, max_teams) values ($1, $2, 'A', 8) returning id`,
    [seed.seasonId, `${TAG} Div`]
  );
  seed.divisionId = d!.id;
});

test.afterAll(async () => {
  await stagingSql(`delete from leagues where id = $1 or name like $2`, [seed.leagueId, `${TAG}%`]).catch(() => undefined);
  if (seed.newOrgId) {
    await stagingSql(`delete from user_role_assignments where scope_id = $1`, [seed.newOrgId]).catch(() => undefined);
    await stagingSql(`delete from orgs where id = $1`, [seed.newOrgId]).catch(() => undefined);
  }
});

test("item 1: super admin creates an organisation and its org admin inside Org setup", async ({ browser }) => {
  test.setTimeout(240_000);
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApi(page, "item1");
  await page.goto(`${E2E_URLS.superadmin}/org-setup`);
  await expect(page.getByRole("heading", { name: "Pick the organisation." })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /New organisation/ }).first().click();

  await page.locator("#displayName").fill(`${TAG} Org`);
  await page.locator("#legalName").fill(`${TAG} Org Inc.`);
  await page.locator("#slug").fill(`${TAG.toLowerCase()}-org`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText("Choose the org admin")).toBeVisible({ timeout: 20_000 });

  const [org] = await stagingSql<{ id: string }>(`select id from orgs where display_name = $1`, [`${TAG} Org`]);
  expect(org, "organisation row created").toBeTruthy();
  seed.newOrgId = org!.id;

  // Pick the staging org admin by NAME (CLAUDE.md: pickers, never ids).
  const filter = page.getByRole("checkbox", { name: /Only show users who already have/ });
  if (await filter.isChecked()) await filter.uncheck();
  await page.getByPlaceholder(/Search by name or email/).fill("staging-org");
  await page.getByRole("button", { name: /staging-org@/i }).first().click();
  await page.getByRole("button", { name: "Assign role" }).click();
  await expect
    .poll(async () => (await stagingSql<{ n: number }>(
      `select count(*)::int n from user_role_assignments ura join roles r on r.id = ura.role_id
       where ura.scope_type = 'org' and ura.scope_id = $1 and r.code = 'org_admin' and ura.revoked_at is null`,
      [seed.newOrgId]
    ))[0]?.n, { timeout: 15_000 })
    .toBe(1);
  await page.getByRole("button", { name: "Continue with this organisation" }).click();
  await expect(page.getByRole("button", { name: "Next: League" })).toBeEnabled();
  console.log(`[item1] org ${seed.newOrgId} created with org_admin; wizard continues`);
  await context.close();

  // Org admins never get the option.
  const oa = await signedInAs(browser, "orgAdmin");
  await oa.page.goto(`${E2E_URLS.orgAdmin}/org-setup`);
  await expect(oa.page.getByRole("heading", { name: "Pick the organisation." })).toBeVisible({ timeout: 30_000 });
  await expect(oa.page.getByRole("button", { name: /New organisation/ })).toHaveCount(0);
  await oa.context.close();
});

test("item 2: edit league, add a season, edit season, add a division, edit division", async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApi(page, "item2");

  // League: edit + new season.
  await page.goto(`${E2E_URLS.superadmin}/leagues/${seed.leagueId}`);
  await page.getByRole("button", { name: "Edit league" }).click();
  await page.getByLabel("League name", { exact: true }).fill(`${TAG} League Renamed`);
  await page.getByRole("button", { name: "Save league" }).click();
  await expect(page.getByRole("heading", { name: `${TAG} League Renamed` }).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "New season" }).click();
  await page.getByLabel("Season name", { exact: true }).fill(`${TAG} Season 2`);
  await page.getByLabel("Season start", { exact: true }).fill(ymd(30));
  await page.getByLabel("Season end", { exact: true }).fill(ymd(150));
  await page.getByLabel("Registration opens", { exact: true }).fill(ymd(0));
  await page.getByLabel("Registration closes", { exact: true }).fill(ymd(20));
  await page.getByRole("button", { name: "Create season" }).click();
  await expect(page.getByText(`${TAG} Season 2`).first()).toBeVisible({ timeout: 20_000 });
  const [s2] = await stagingSql<{ id: string }>(
    `select id from seasons where league_id = $1 and name = $2`,
    [seed.leagueId, `${TAG} Season 2`]
  );
  expect(s2, "new season saved under the league").toBeTruthy();

  // Season: edit + new division.
  await page.goto(`${E2E_URLS.superadmin}/seasons/${seed.seasonId}`);
  await page.getByRole("button", { name: "Edit season" }).click();
  await page.getByLabel("Season name", { exact: true }).fill(`${TAG} Season Renamed`);
  await page.getByRole("button", { name: "Save season" }).click();
  await expect(page.getByRole("heading", { name: `${TAG} Season Renamed` }).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "New division" }).click();
  await page.getByLabel("Division name", { exact: true }).fill(`${TAG} Div 2`);
  await page.getByRole("button", { name: "Create division" }).click();
  await expect(page.getByText(`${TAG} Div 2`).first()).toBeVisible({ timeout: 20_000 });

  // Division: edit.
  await page.goto(`${E2E_URLS.superadmin}/divisions/${seed.divisionId}`);
  await page.getByRole("button", { name: "Edit division" }).click();
  await page.getByLabel("Division name", { exact: true }).fill(`${TAG} Div Renamed`);
  await page.getByLabel("Max teams", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Save division" }).click();
  await expect(page.getByRole("heading", { name: `${TAG} Div Renamed` }).first()).toBeVisible({ timeout: 20_000 });

  const [row] = await stagingSql<{ league: string; season: string; division: string; max: number; divs: number }>(
    `select l.name league, s.name season, d.name division, d.max_teams max,
       (select count(*)::int from divisions where season_id = s.id) divs
     from divisions d join seasons s on s.id = d.season_id join leagues l on l.id = s.league_id where d.id = $1`,
    [seed.divisionId]
  );
  expect(row).toMatchObject({
    league: `${TAG} League Renamed`,
    season: `${TAG} Season Renamed`,
    division: `${TAG} Div Renamed`,
    max: 12,
    divs: 2
  });
  console.log(`[item2] ${JSON.stringify(row)}`);
  await context.close();
});

test("item 2: org setup adds a season to an existing league (no new league)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApi(page, "item2-wizard");
  await page.goto(`${E2E_URLS.superadmin}/org-setup`);
  await expect(page.getByRole("heading", { name: "Pick the organisation." })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /PPHL Staging/ }).first().click();
  await page.getByRole("button", { name: "Next: League" }).click();
  await page.getByRole("button", { name: "Add to an existing league" }).click();
  await page.getByLabel("League", { exact: true }).selectOption({ label: `${TAG} League Renamed` });
  await page.getByRole("button", { name: "Next: Season" }).click();

  const field = (label: string) =>
    page.locator(
      `xpath=//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select]`
    ).first();
  await field("Season name").fill(`${TAG} Season 3`);
  await field("Season start date").fill(ymd(200));
  await field("Season end date").fill(ymd(300));
  await field("Registration opens").fill(ymd(1));
  await field("Registration closes").fill(ymd(30));
  await field("Roster lock date").fill(ymd(40));
  await page.getByRole("button", { name: "Next: Divisions" }).click();
  await page
    .locator(`xpath=(//label[starts-with(normalize-space(.), "Division name")]/following-sibling::*[1]/descendant-or-self::input)[1]`)
    .fill(`${TAG} Div 3`);
  await page.getByRole("button", { name: "Publish league" }).click();
  await page.waitForURL(new RegExp(`/leagues/${seed.leagueId}`), { timeout: 60_000 });

  const [c] = await stagingSql<{ leagues: number; seasons: number; div3: number }>(
    `select (select count(*)::int from leagues where name like $1) leagues,
       (select count(*)::int from seasons where league_id = $2) seasons,
       (select count(*)::int from divisions d join seasons s on s.id = d.season_id where s.league_id = $2 and d.name = $3) div3`,
    [`${TAG}%`, seed.leagueId, `${TAG} Div 3`]
  );
  expect(c).toMatchObject({ leagues: 1, seasons: 3, div3: 1 });
  console.log(`[item2-wizard] ${JSON.stringify(c)}`);
  await context.close();
});

test("items 5 and 6: player edits their profile fields; admin's Edit profile shows them", async ({ browser }) => {
  test.setTimeout(300_000);
  const stamp = `${Date.now()}`.slice(-4);
  const city = `Boston ${stamp}`;
  const pl = await signedInAs(browser, "player");
  logApi(pl.page, "item5");
  await pl.page.goto(`${E2E_URLS.player}/profile`);
  await expect(pl.page.getByText("Player profile").first()).toBeVisible({ timeout: 30_000 });

  const labels = [
    "Date of birth", "Gender", "Phone", "Photo / avatar", "Street address", "City", "State / region",
    "Postal code", "USA Hockey ID", "USA Hockey ID expiry", "Emergency contact name",
    "Emergency contact phone", "Position(s)", "Shot hand", "Height (cm)", "Weight (kg)", "Level",
    "Medical / allergy notes"
  ];
  const missing: string[] = [];
  for (const l of labels) if ((await pl.page.getByText(l, { exact: false }).count()) === 0) missing.push(l);
  expect(missing, `fields missing on player Profile: ${missing.join(", ")}`).toEqual([]);

  await pl.page.getByLabel(/^City/).fill(city);
  await pl.page.getByLabel(/^Height/).fill("180");
  await pl.page.getByRole("button", { name: "Save profile" }).click();
  await expect(pl.page.getByText(/saved/i).first()).toBeVisible({ timeout: 20_000 });

  // Same surface, no reload: still shows the value; then reload: persisted.
  await expect(pl.page.getByLabel(/^City/)).toHaveValue(city);
  await pl.page.reload();
  await expect(pl.page.getByLabel(/^City/)).toHaveValue(city, { timeout: 20_000 });
  const [prof] = await stagingSql<{ city: string; height: string }>(
    `select metadata->'roleProfile'->'player'->>'addressCity' city, metadata->'roleProfile'->'player'->>'heightCm' height
     from profiles where email = 'staging-player@sportspulse.us'`
  );
  expect(prof?.city).toBe(city);
  console.log(`[item5] saved ${JSON.stringify(prof)}`);
  await pl.context.close();

  // Item 6: admin opens the same user's Edit profile and sees the values.
  const [u] = await stagingSql<{ id: string }>(`select id from profiles where email = 'staging-player@sportspulse.us'`);
  const sa = await signedInAs(browser, "superAdmin");
  logApi(sa.page, "item6");
  await sa.page.goto(`${E2E_URLS.superadmin}/users/${u!.id}`);
  await sa.page.getByRole("button", { name: "Edit profile" }).first().click();
  const dialog = sa.page.getByRole("dialog");
  await expect(dialog.getByText("Edit user profile")).toBeVisible({ timeout: 20_000 });
  for (const l of ["Date of birth", "Phone", "City", "USA Hockey ID", "Emergency contact name", "Level"]) {
    await expect(dialog.getByText(l).first(), `Edit user profile shows ${l}`).toBeVisible();
  }
  await expect(dialog.getByLabel(/^City/)).toHaveValue(city);
  console.log("[item6] admin dialog shows the player's saved values");
  await sa.context.close();
});
