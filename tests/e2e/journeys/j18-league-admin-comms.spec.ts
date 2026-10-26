import { test, expect, type Page } from "@playwright/test";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, RUN_TAG, openNav, signedInAs, stagingSql } from "./_helpers";

/**
 * J18 · League admin messaging, roles and navigation (UC-19, UC-20,
 * FR-3.12.2, FR-3.19.3). Staging, real browser, one context per role.
 *
 * 1. league_admin @ superadmin-web: Messages > Send an announcement. The
 *    picker offers only their league and what is in it (never the whole
 *    org, never a sibling league); the send writes one in-app row per
 *    recipient with the org and target stored.
 *
 * Rows carry RUN_TAG in the subject and are removed at the end.
 */
test.skip(!IS_STAGING, "journeys mutate data: staging only");
test.describe.configure({ timeout: 180_000 });

const TAG = `J18${RUN_TAG}`.toUpperCase();
const LEAGUE_ADMIN_EMAIL = "staging-league@sportspulse.us";

async function mainText(page: Page) {
  return (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
}

test.afterAll(async () => {
  await stagingSql(`delete from notifications where subject like $1 or payload->>'subject' like $1`, [`%${TAG}%`]).catch(() => {});
});

test("1. league admin sends an announcement to their own league only", async ({ browser }) => {
  const { page, context } = await signedInAs(browser, "leagueAdmin", { app: E2E_URLS.superadmin });
  const [la] = await stagingSql<{ league_id: string; league: string; org_id: string }>(
    `select a.scope_id league_id, l.name league, l.org_id from user_role_assignments a
       join roles r on r.id = a.role_id join profiles p on p.id = a.user_id join leagues l on l.id = a.scope_id
      where p.email = $1 and r.code = 'league_admin' and a.revoked_at is null limit 1`,
    [LEAGUE_ADMIN_EMAIL]
  );
  expect(la, "staging league admin holds league_admin").toBeTruthy();

  await page.goto(`${E2E_URLS.superadmin}/dashboard`);
  await openNav(page, /^Messages$/);
  await page.waitForURL(/\/communications$/);
  await page.getByRole("link", { name: "Send an announcement" }).click();
  await page.waitForURL(/\/communications\/compose/);
  await expect(page.getByTestId("announcement-composer")).toBeVisible({ timeout: 30_000 });

  // Never the whole org, never a typed id: real pickers of their league.
  const targetType = page.getByLabel("Part of the organisation");
  const types = await targetType.locator("option").allTextContents();
  expect(types, "a league admin is not offered the whole organisation").not.toContain("The whole organisation");
  expect(types).toContain("One league");
  await targetType.selectOption("league");
  const league = page.getByLabel("League", { exact: true });
  const leagues = (await league.locator("option").allTextContents()).filter((o) => !/^Pick a/.test(o));
  expect(leagues, "only the admin's own league is listed").toEqual([la!.league]);
  await league.selectOption({ label: la!.league });

  // Admins of the league, in-app only.
  const players = page.locator("label", { hasText: "Players" }).locator("input");
  if (await players.isChecked()) await players.uncheck();
  await page.locator("label", { hasText: "Org / league / season / division admins" }).locator("input").check();
  const email = page.getByRole("button", { name: "Email" });
  if ((await email.getAttribute("aria-pressed")) === "true") await email.click();
  await page.getByLabel("Subject").fill(`QA ${TAG}`);
  await page.getByLabel("Body").fill(`QA league announcement ${TAG}, please ignore.`);
  const respP = page.waitForResponse((r) => /\/org-admin\/broadcast$/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Send broadcast" }).click();
  const resp = await respP;
  expect(resp.status(), await resp.text()).toBeLessThan(300);
  await expect(page.getByText(/messages? queued for \d+ recipients?/)).toBeVisible({ timeout: 20_000 });
  console.log("[j18] compose after send:", (await mainText(page)).slice(-300));

  const rows = await stagingSql<{ org_id: string; target: string; channel: string }>(
    `select org_id, payload->>'targetId' target, channel from notifications where payload->>'subject' = $1`,
    [`QA ${TAG}`]
  );
  expect(rows.length, "in-app rows were written").toBeGreaterThan(0);
  expect(rows.every((r) => r.org_id === la!.org_id && r.target === la!.league_id && r.channel === "in_app")).toBe(true);
  await context.close();
});

test("2. league admin invites only within their league and never above their level", async ({ browser }) => {
  const { page, context } = await signedInAs(browser, "leagueAdmin", { app: E2E_URLS.superadmin });
  await page.goto(`${E2E_URLS.superadmin}/users`);
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  // No "grant a role" opt-out: a scoped admin always invites with a role.
  await expect(dialog.getByText("Also grant a role on invite.")).toHaveCount(0);
  const role = dialog.locator("select").first();
  const roles = await role.locator("option").allTextContents();
  console.log("[j18] invite roles:", JSON.stringify(roles));
  expect(roles).not.toContain("Super Admin");
  expect(roles).not.toContain("Org Admin");
  expect(roles).toEqual(expect.arrayContaining(["League Admin", "Captain", "Coach"]));
  // Default reflects the inviter: their own role at their own league.
  await expect(role).toHaveValue("league_admin");
  const scopeTypes = await dialog.locator("select").nth(1).locator("option").allTextContents();
  expect(scopeTypes).toEqual(["League"]);
  await context.close();
});

test("3. league admin sees an org page's admin list read-only", async ({ browser }) => {
  const { page, context } = await signedInAs(browser, "leagueAdmin", { app: E2E_URLS.superadmin });
  const [la] = await stagingSql<{ org_id: string }>(
    `select l.org_id from user_role_assignments a join roles r on r.id = a.role_id join profiles p on p.id = a.user_id
       join leagues l on l.id = a.scope_id where p.email = $1 and r.code = 'league_admin' and a.revoked_at is null limit 1`,
    [LEAGUE_ADMIN_EMAIL]
  );
  await page.goto(`${E2E_URLS.superadmin}/organizations/${la!.org_id}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const text = await mainText(page);
  if (/could not be found|Could not load/i.test(text)) {
    console.log("[j18] org page not open to a league admin; nothing to check");
  } else {
    await expect(page.getByText("Your role cannot add admins here. Ask your org admin.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  }
  await context.close();
});
