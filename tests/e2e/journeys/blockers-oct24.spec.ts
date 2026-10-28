import { test, expect } from "@playwright/test";
import { request as httpsRequest } from "node:https";
import { existsSync } from "node:fs";
import { E2E_URLS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH } from "../../../playwright.config";
import { IS_STAGING, RUN_TAG, loadEnvLocal, stagingSql } from "./_helpers";

/**
 * SP-Changes (1).pdf, PPHL 24 Oct 2026 — blockers 3 and 4.
 *
 * 3. Org setup published a league with no season or divisions when the
 *    admin was east of UTC and registration opened today. Driven in a
 *    browser whose clock is Asia/Kolkata, like the tester's.
 * 4. A captain whose team has no division entry saw an empty free-agent
 *    pool. A fresh captain + team with no entry, and a free agent in an
 *    active season of the same org, checked on the captain app.
 */
test.skip(!IS_STAGING, "staging only");

const TAG = `${RUN_TAG}BK`;
const ORG_ID = "f7e62723-7685-4ba0-80e5-310c266c7b81"; // PPHL Staging
const SPORT = "HOCKEY_ICE";

function istYmd(offsetDays = 0) {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function wizardField(page: import("@playwright/test").Page, label: string) {
  return page
    .locator(
      `xpath=//label[starts-with(normalize-space(.), "${label}")]/following-sibling::*[1]/descendant-or-self::*[self::input or self::select or self::textarea]`
    )
    .first();
}

/** Supabase admin API through the pinned edge IP (local DNS hijacks *.supabase.co). */
function supabaseAdmin(method: string, path: string, body?: unknown): Promise<any> {
  const env = loadEnvLocal();
  const url = new URL(path, env.STAGING_SUPABASE_URL);
  const key = env.STAGING_SUPABASE_SERVICE_ROLE_KEY!;
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: process.env.E2E_SUPABASE_IP ?? url.hostname,
        servername: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          Host: url.hostname,
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 300) reject(new Error(`${method} ${path} ${res.statusCode}: ${data}`));
          else resolve(data ? JSON.parse(data) : null);
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("item 3: org setup in India time, registration opening today, saves league + season + division", async ({ browser }) => {
  test.setTimeout(240_000);
  const league = `${TAG} League`;
  const context = await browser.newContext({
    timezoneId: "Asia/Kolkata",
    ...(existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {})
  });
  const page = await context.newPage();
  const apiErrors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && /staging-api/.test(r.url())) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  try {
    await signIn(page, E2E_URLS.superadmin, (await import("../fixtures")).SMOKE_USERS.superAdmin);
    await page.goto(`${E2E_URLS.superadmin}/org-setup`);
    await expect(page.getByRole("heading", { name: "Which organization?" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /PPHL Staging/ }).first().click();
    await page.getByRole("button", { name: "Next: League" }).click();

    await wizardField(page, "League name").fill(league);
    await wizardField(page, "Sport").selectOption({ label: "Ice Hockey" });
    await page.getByRole("button", { name: "Next: Season" }).click();

    await wizardField(page, "Season name").fill(`${TAG} Season`);
    await wizardField(page, "Season start date").fill(istYmd(14));
    await wizardField(page, "Season end date").fill(istYmd(120));
    // The exact case that failed for PPHL: registration opens today.
    await wizardField(page, "Registration opens").fill(istYmd(0));
    await wizardField(page, "Registration closes").fill(istYmd(10));
    await wizardField(page, "Roster lock date").fill(istYmd(12));
    await page.getByRole("button", { name: "Next: Divisions" }).click();

    await page
      .locator(`xpath=(//label[starts-with(normalize-space(.), "Division name")]/following-sibling::*[1]/descendant-or-self::input)[1]`)
      .fill(`${TAG} Div A`);
    await page.getByRole("button", { name: "Publish league" }).click();
    await page.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 60_000 });
    console.log(`[blockers] wizard landed on ${page.url()} apiErrors=${apiErrors.join(" | ") || "none"}`);

    const rows = await stagingSql<{ id: string; seasons: number; divisions: number }>(
      `select l.id,
         (select count(*)::int from seasons s where s.league_id = l.id) seasons,
         (select count(*)::int from divisions d join seasons s on s.id = d.season_id where s.league_id = l.id) divisions
       from leagues l where l.name = $1`,
      [league]
    );
    expect(rows.length, "exactly one league, no orphans from retries").toBe(1);
    expect(rows[0]).toMatchObject({ seasons: 1, divisions: 1 });

    // Destination: the seasons and divisions lists show them.
    await page.goto(`${E2E_URLS.superadmin}/seasons?q=${encodeURIComponent(TAG)}`);
    await expect(page.getByRole("link", { name: `${TAG} Season` })).toBeVisible({ timeout: 20_000 });
    await page.goto(`${E2E_URLS.superadmin}/divisions?q=${encodeURIComponent(TAG)}`);
    await expect(page.getByRole("link", { name: `${TAG} Div A` })).toBeVisible({ timeout: 20_000 });
  } finally {
    await stagingSql(`delete from leagues where name = $1`, [league]).catch(() => undefined);
    await context.close();
  }
});

test("item 4: a captain whose team has no season entry sees the org's free agents", async ({ browser }) => {
  test.setTimeout(240_000);
  const email = `${TAG.toLowerCase()}.captain@example.test`;
  const password = `Bk!${Date.now()}aA9`;
  let userId: string | null = null;
  let teamId: string | null = null;
  let personId: string | null = null;
  try {
    const user = await supabaseAdmin("POST", "/auth/v1/admin/users", {
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `${TAG} Captain` },
      app_metadata: { role_codes: ["captain"], profile_complete: true }
    });
    userId = user.id as string;
    const [team] = await stagingSql<{ id: string }>(
      `insert into teams (org_id, name, sport_code) values ($1, $2, $3) returning id`,
      [ORG_ID, `${TAG} Fresh Team`, SPORT]
    );
    teamId = team!.id;
    await stagingSql(
      `insert into user_role_assignments (user_id, role_id, scope_type, scope_id)
       select $1, id, 'team', $2 from roles where code = 'captain'`,
      [userId, teamId]
    );
    const [person] = await stagingSql<{ id: string }>(
      `insert into persons (legal_first_name, legal_last_name) values ($1, 'Agent') returning id`,
      [`${TAG} Free`]
    );
    personId = person!.id;
    const [season] = await stagingSql<{ id: string; name: string }>(
      `select id, name from seasons where org_id = $1 and status not in ('completed','archived') and deleted_at is null
       order by created_at limit 1`,
      [ORG_ID]
    );
    await stagingSql(
      `insert into free_agent_pool_entries (player_person_id, season_id, positions, level_primary, status)
       values ($1, $2, array['forward'], 'B', 'active')`,
      [personId, season!.id]
    );
    const [entries] = await stagingSql<{ n: number }>(
      `select count(*)::int n from division_team_entries where team_id = $1`,
      [teamId]
    );
    expect(entries!.n, "seeded team has no division entry, like October Test Team").toBe(0);

    const context = await browser.newContext(existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {});
    const page = await context.newPage();
    await signIn(page, E2E_URLS.teamAdmin, email, password);
    await page.goto(`${E2E_URLS.teamAdmin}/captain/free-agents`);
    await expect(page.getByRole("heading", { name: /Free agents/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`${TAG} Free Agent`).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(season!.name).first()).toBeVisible();
    await expect(page.getByText("Pool is empty")).toHaveCount(0);
    console.log(`[blockers] captain sees free agent in "${season!.name}"`);
    await context.close();
  } finally {
    if (personId) await stagingSql(`delete from persons where id = $1`, [personId]).catch(() => undefined);
    if (teamId) await stagingSql(`delete from teams where id = $1`, [teamId]).catch(() => undefined);
    if (userId) await supabaseAdmin("DELETE", `/auth/v1/admin/users/${userId}`).catch(() => undefined);
  }
});
