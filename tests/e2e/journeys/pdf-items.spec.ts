import { test, expect, type Page } from "@playwright/test";
import { E2E_URLS } from "../fixtures";
import { signedInAs, stagingSql, IS_STAGING } from "./_helpers";

/**
 * SP-Changes.pdf items 1-7 (PPHL review call, 23 Oct 2026), checked in a
 * real browser per role on staging.
 */
test.skip(!IS_STAGING, "staging only");

// 8 hex chars on their own: the id fragments PPHL asked us to remove.
const HEX_FRAGMENT = /(?<![0-9a-z-])[0-9a-f]{8}(?![0-9a-z-])/i;

// Pages here turn API errors into empty lists or a 404, so log the cause.
function logApiErrors(page: Page) {
  page.on("response", (r) => {
    if (r.status() >= 400 && /sp-api|\/api\/|supabase/.test(r.url()))
      console.log(`[pdf] ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

async function visibleHexFragments(page: Page): Promise<string[]> {
  const text = await page.locator("main").innerText().catch(() => "");
  // The player's registration "Ref" is a reference code on purpose; skip it.
  return [...text.matchAll(new RegExp(HEX_FRAGMENT, "gi"))]
    .filter((m) => !/ref[\s:·#-]*$/i.test(text.slice(Math.max(0, (m.index ?? 0) - 12), m.index)))
    .map((m) => m[0]);
}

test("items 1/4: user detail shows the scope by name, not an id", async ({ browser }) => {
  const [player] = await stagingSql<{ id: string }>(
    "select id from profiles where email = 'staging-player@sportspulse.us'"
  );
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApiErrors(page);
  await page.goto(`${E2E_URLS.superadmin}/users/${player!.id}`);
  await expect(page.getByText(/ACTIVE ROLE ASSIGNMENTS/i)).toBeVisible({ timeout: 20_000 });
  const hex = await visibleHexFragments(page);
  expect(hex, `id fragments on /users/[id]: ${hex.join(", ")}`).toEqual([]);
  await expect(page.getByText(/scope: team · Staging Skaters/i).first()).toBeVisible();
  await context.close();
});

test("item 7: users search and filters narrow the list", async ({ browser }) => {
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApiErrors(page);
  await page.goto(`${E2E_URLS.superadmin}/users`);
  const total = await page.getByText(/Showing \d+ of \d+ users/).innerText();
  await page.getByLabel("Search by name or email").fill("staging-player");
  await expect(page).toHaveURL(/q=staging-player/, { timeout: 10_000 });
  await expect(page.getByText(/Showing 1 of \d+ users/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /Staging Player/ })).toBeVisible();
  await page.getByLabel("Search by name or email").fill("");
  await page.getByLabel("Status").selectOption("suspended");
  await expect(page).toHaveURL(/status=suspended/);
  await page.getByLabel("Status").selectOption("");
  await page.getByLabel("Type").selectOption({ label: "Captain" });
  await expect(page.getByText(/Showing \d+ of \d+ users/)).not.toHaveText(total, { timeout: 15_000 });
  await expect(page.getByLabel("Region", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Country", { exact: true })).toBeVisible();
  await context.close();
});

test("item 3: forms page has search, org and scope filters; no version ids", async ({ browser }) => {
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApiErrors(page);
  await page.goto(`${E2E_URLS.superadmin}/forms`);
  await expect(page.getByLabel("Search forms by name")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Organisation")).toBeVisible();
  await expect(page.getByLabel("Scope")).toBeVisible();
  const hex = await visibleHexFragments(page);
  expect(hex, `id fragments on /forms: ${hex.join(", ")}`).toEqual([]);
  const before = await page.getByText(/Showing \d+ of \d+ forms/).innerText();
  await page.getByLabel("Scope").selectOption("league");
  await expect(page).toHaveURL(/scope=league/);
  const [{ n }] = await stagingSql<{ n: number }>(
    "select count(*)::int n from registration_forms where deleted_at is null and scope = 'league'"
  );
  await expect(page.getByText(new RegExp(`Showing ${n} of \\d+ forms`))).toBeVisible({ timeout: 15_000 });
  console.log(`[pdf] forms ${before} -> ${await page.getByText(/Showing \d+ of \d+ forms/).innerText()}`);
  await context.close();
});

test("item 2: a season moved to In progress stays open while its window is open", async ({ browser }) => {
  // A staging-org season with a published season form and an open window.
  const [s] = await stagingSql<{ id: string; name: string; status: string }>(
    `select s.id, s.name, s.status from seasons s
       join leagues l on l.id = s.league_id
       join registration_forms f on f.season_id = s.id and f.purpose = 'season_registration'
            and f.active_version_id is not null and f.deleted_at is null
      where l.org_id = (select org_id from teams where name = 'Staging Skaters' limit 1)
        and s.registration_opens_at <= now() and s.registration_closes_at >= now()
        and s.status = 'registration_open'
      order by s.created_at desc limit 1`
  );
  test.skip(!s, "no open staging season with a published form");
  // Admin moves it to In progress through the real status menu.
  const sa = await signedInAs(browser, "superAdmin");
  logApiErrors(sa.page);
  await sa.page.goto(`${E2E_URLS.superadmin}/seasons/${s!.id}`);
  await sa.page.locator("main button", { hasText: "registration open" }).first().click();
  await sa.page
    .locator("main ul li button")
    .filter({ has: sa.page.locator("p.font-medium", { hasText: /^In progress$/ }) })
    .click();
  await expect.poll(async () => (await stagingSql<{ status: string }>("select status from seasons where id=$1", [s!.id]))[0]?.status, { timeout: 15_000 }).toBe("in_progress");
  await sa.context.close();
  // Player in that org still finds it.
  const pl = await signedInAs(browser, "player");
  logApiErrors(pl.page);
  await pl.page.goto(`${E2E_URLS.player}/register`);
  await expect(pl.page.getByText(s!.name).first()).toBeVisible({ timeout: 20_000 });
  await pl.context.close();
});

test("item 6: captain free-agent page lists the pool across the team's live seasons", async ({ browser }) => {
  const { page, context } = await signedInAs(browser, "teamAdmin");
  logApiErrors(page);
  await page.goto(`${E2E_URLS.teamAdmin}/captain/free-agents`);
  await expect(page.getByRole("heading", { name: /Free agents/i }).first()).toBeVisible({ timeout: 20_000 });
  const [pool] = await stagingSql<{ n: number }>(
    `select count(*)::int n from free_agent_pool_entries e
      where e.status = 'active' and e.season_id in (
        select d.season_id from division_team_entries dte join divisions d on d.id = dte.division_id
         where dte.team_id = (select id from teams where name = 'Staging Skaters' limit 1)
           and dte.entry_status not in ('rejected','withdrawn','disqualified'))`
  );
  const rows = await page.locator("main tbody tr").count();
  console.log(`[pdf] captain pool rows=${rows} db active in live seasons=${pool!.n}`);
  expect(rows).toBe(pool!.n);
  await context.close();
});

test("items 1/4: no id fragments on key pages per role", async ({ browser }) => {
  test.setTimeout(240_000); // 14 page loads across three apps
  const checks: Array<[Parameters<typeof signedInAs>[1], string[]]> = [
    ["superAdmin", ["/teams", "/divisions", "/seasons", "/rosters", "/audit", "/registrations"]],
    ["teamAdmin", ["/", "/roster", "/schedule", "/lineups"]],
    ["player", ["/", "/team", "/schedule", "/registrations"]]
  ];
  const found: string[] = [];
  for (const [role, paths] of checks) {
    const { page, app, context } = await signedInAs(browser, role);
    logApiErrors(page);
    for (const p of paths) {
      const t0 = Date.now();
      await page.goto(`${app}${p}`);
      // Live pages poll, so "network idle" never comes; wait for content.
      await page.locator("main h1, main h2").first().waitFor({ timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1_500);
      console.log(`[pdf] scan ${role} ${p} ${Date.now() - t0}ms`);
      const hex = await visibleHexFragments(page);
      if (hex.length) found.push(`${role} ${p}: ${[...new Set(hex)].join(", ")}`);
    }
    await context.close();
  }
  expect(found, found.join("\n")).toEqual([]);
});
