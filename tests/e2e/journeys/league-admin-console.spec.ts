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
 * another organization never appears in the list, the search, or by URL.
 */
test.skip(!IS_STAGING, "staging only");

const FORBIDDEN = /Super admin access required|Requires super_admin|Requires an admin role|Could not load|does not have access/i;
// Next's default text, or the shared NotFoundPanel in the console shell.
const NOT_FOUND = /This page could not be found|This page is not here/;

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
  // The way back is the breadcrumb (the shared shell dropped repeated back links).
  await expect(page.getByRole("navigation", { name: /breadcrumb/i }).getByRole("link", { name: "Users" })).toBeVisible({ timeout: 20_000 });

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

test("league admin never sees a user whose only role is in another organization", async ({ browser }) => {
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

test("league admin: Invoices shows their league's totals and invoices, never another league's", async ({ browser }) => {
  test.setTimeout(180_000);
  // One invoice in the league admin's league, one in a sibling league of the same org.
  const tag = `${RUN_TAG}LAFIN`;
  const [own] = await stagingSql<{ id: string }>(
    `select s.id from seasons s join leagues l on l.id = s.league_id where l.name = 'PPHL Staging League' order by s.created_at limit 1`
  );
  const [sib] = await stagingSql<{ id: string; org_id: string }>(
    `select s.id, s.org_id from seasons s join leagues l on l.id = s.league_id
      where l.name <> 'PPHL Staging League' and l.org_id = (select org_id from leagues where name = 'PPHL Staging League' limit 1) limit 1`
  );
  test.skip(!own || !sib, "needs a season in the league and in a sibling league");
  const ids: string[] = [];
  for (const [n, season] of [["own", own!.id], ["sibling", sib!.id]] as const) {
    const [r] = await stagingSql<{ id: string }>(
      `insert into invoices (org_id, invoice_number, status, subtotal_cents, total_cents, season_id, issued_at, due_at)
       values ($1, $2, 'sent', 1234, 1234, $3, now(), now() + interval '9 days') returning id`,
      [sib!.org_id, `${tag}-${n}`, season]
    );
    ids.push(r!.id);
  }
  const { page, context } = await signedInAs(browser, "leagueAdmin", { app: E2E_URLS.superadmin });
  try {
    await page.goto(`${E2E_URLS.superadmin}/finance`);
    const main = page.locator("main").first();
    await expect(main.getByText("Total invoiced").first(), "AR tiles render").toBeVisible({ timeout: 30_000 });
    expect.soft((await main.innerText()).replace(/\s+/g, " "), "no access or load error").not.toMatch(FORBIDDEN);
    await page.getByPlaceholder("Search name, email, invoice #").fill(tag);
    await page.getByPlaceholder("Search name, email, invoice #").press("Enter");
    await page.waitForURL(/[?&]q=/);
    await expect(main.getByText(`${tag}-own`), "own league's invoice listed").toBeVisible({ timeout: 20_000 });
    await expect(main.getByText(`${tag}-sibling`), "sibling league's invoice not listed").toHaveCount(0);
    // Opening the sibling invoice by URL is a not-found, not its details.
    await page.goto(`${E2E_URLS.superadmin}/finance/${ids[1]}`);
    expect.soft(await page.getByText(`${tag}-sibling`).count(), "sibling invoice detail not shown").toBe(0);
  } finally {
    await context.close();
    await stagingSql(`delete from invoices where id = any($1::uuid[])`, [ids]);
  }
});
