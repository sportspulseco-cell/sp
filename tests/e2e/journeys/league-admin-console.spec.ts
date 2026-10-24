import { test, expect } from "@playwright/test";
import { E2E_URLS } from "../fixtures";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql } from "./_helpers";

/**
 * PPHL's own persona: a league admin signed in to the admin console.
 * The 24 Oct 2026 crawl found Users / Forms saying "Could not load",
 * Registrations / Division applications / Transfers / Eligibility saying
 * "Super admin access required", user detail pages rendering 404, and
 * every Roles row linking to a 404. Staging, real browser.
 *
 * Also asserts what the role must NOT see: a user whose only role is in
 * another organisation never appears in the list, the search, or by URL.
 */
test.skip(!IS_STAGING, "staging only");

const FORBIDDEN = /Super admin access required|Requires super_admin|Requires an admin role|Could not load|does not have access/i;
const NOT_FOUND = /This page could not be found/;

test("league admin: every console page loads with data, none says 404 or access required", async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, context } = await signedInAs(browser, "leagueAdmin", { app: E2E_URLS.superadmin });
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && /staging-api|\/api\//.test(r.url()) && r.request().method() === "GET") {
      failures.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`);
    }
  });
  const main = () => page.locator("main").first();

  for (const path of ["/users", "/forms", "/registrations", "/division-applications", "/transfers", "/eligibility", "/documents"]) {
    failures.length = 0;
    await page.goto(`${E2E_URLS.superadmin}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const text = (await main().innerText()).replace(/\s+/g, " ");
    expect.soft(text, `${path} shows an access/load error`).not.toMatch(FORBIDDEN);
    expect.soft(text, `${path} is a 404`).not.toMatch(NOT_FOUND);
    expect.soft(failures, `${path} had failing GETs`).toEqual([]);
    console.log(`[la] ${path} ok · ${text.slice(0, 90)}`);
  }

  // Users: rows exist and the count is not zero.
  await page.goto(`${E2E_URLS.superadmin}/users`);
  await expect(page.getByText(/Showing \d+ of \d+ users/)).toBeVisible({ timeout: 20_000 });
  const shown = await page.getByText(/Showing \d+ of \d+ users/).innerText();
  expect(Number(/of (\d+)/.exec(shown)?.[1] ?? 0)).toBeGreaterThan(0);

  // A user inside the scope opens (no 404): the org admin of the same org.
  const [orgAdmin] = await stagingSql<{ id: string }>(
    `select id from profiles where email = 'staging-org@sportspulse.us'`
  );
  expect(orgAdmin, "staging org admin account exists").toBeTruthy();
  await page.goto(`${E2E_URLS.superadmin}/users/${orgAdmin!.id}`);
  await expect(page.locator("h1").first()).not.toHaveText(/404/);
  await expect(page.getByRole("link", { name: "All users" })).toBeVisible({ timeout: 20_000 });

  // Roles: a row opens a real page (was a 404 for everyone).
  await page.goto(`${E2E_URLS.superadmin}/roles`);
  const firstRole = page.getByRole("link", { name: /league_admin/ }).first();
  await expect(firstRole).toBeVisible({ timeout: 20_000 });
  await firstRole.click();
  await expect(page).toHaveURL(/\/roles\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("link", { name: "All roles" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Who holds this role/i)).toBeVisible();

  // Super-admin-only modules are not offered to a scoped admin.
  await expect(page.getByRole("link", { name: "Platform settings" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Import data" })).toHaveCount(0);
  await context.close();
});

test("league admin never sees a user whose only role is in another organisation", async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = `E2E${RUN_TAG}`.toUpperCase();
  // profiles.id is an auth user, so borrow an existing account that holds
  // no role, roster spot or registration anywhere, and give it org_admin
  // on a brand-new Org B for the duration of the test.
  const [candidate] = await stagingSql<{ id: string; email: string }>(
    `select p.id, p.email from profiles p
     where p.is_super_admin = false
       and not exists (select 1 from user_role_assignments u where u.user_id = p.id and u.revoked_at is null)
       and not exists (select 1 from persons pe join team_memberships tm on tm.person_id = pe.id where pe.user_id = p.id)
       and not exists (select 1 from registrations r where r.submitted_by_user_id = p.id)
     order by p.created_at limit 1`
  );
  test.skip(!candidate, "no role-less staging account available to borrow");
  const [orgB] = await stagingSql<{ id: string }>(
    `insert into orgs (slug, legal_name, display_name, org_type, country_code, default_locale, default_currency, status)
     values ($1, $2, $2, 'league_operator', 'US', 'en-US', 'USD', 'active') returning id`,
    [`${tag.toLowerCase()}-orgb`, `${tag} Org B`]
  );
  const [assignment] = await stagingSql<{ id: string }>(
    `insert into user_role_assignments (user_id, role_id, scope_type, scope_id)
     select $1, r.id, 'org', $2 from roles r where r.code = 'org_admin' limit 1 returning id`,
    [candidate!.id, orgB!.id]
  );
  const { page, context } = await signedInAs(browser, "leagueAdmin", { app: E2E_URLS.superadmin });
  try {
    // Sanity: the fixture is what we think (org B admin, nothing else).
    await page.goto(`${E2E_URLS.superadmin}/users?q=${encodeURIComponent(candidate!.email.split("@")[0]!)}`);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const text = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
    expect(text, "org-B admin must not appear in the league admin's user list").not.toContain(candidate!.email);

    // By URL: the 404 page, never the profile.
    await page.goto(`${E2E_URLS.superadmin}/users/${candidate!.id}`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible({ timeout: 20_000 });
    console.log(`[la] org-B user ${candidate!.email} hidden from list and by URL`);
  } finally {
    await context.close();
    await stagingSql(`delete from user_role_assignments where id = $1`, [assignment!.id]);
    await stagingSql(`delete from orgs where id = $1`, [orgB!.id]);
  }
});
