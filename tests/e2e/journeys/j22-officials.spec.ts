import { stagingDbUrl, supabaseFetch } from "./_helpers";
/**
 * J22 · Game-day official runs the scoresheet (SCH-12, PPHL 7.1, UC-11/12)
 *
 * The league admin console assigns a person as scorekeeper on one game
 * (Officials panel). That person signs in to the admin console on an iPad
 * (1024x768), sees only "My games" with that one game, cannot open any
 * other module, starts play, logs a goal and finalizes. The game row,
 * the event and the stat lines are read back from the database.
 *
 * Setup (labelled, removed at the end): a throwaway season, division, two
 * teams with one rostered player each, a rink and one published game, plus
 * the scorekeeper's account and person. The state under test (the crew
 * spot, the console and the scoresheet) is made only through the UI.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { E2E_URLS, SMOKE_USERS, signIn } from "../fixtures";
import { BYPASS_STATE_PATH, OUTPUT_DIR } from "../../../playwright.config";

const IS_STAGING = process.env.E2E_TARGET === "staging";
const RUN_TAG = process.env.E2E_RUN_TAG ?? `E2E${Date.now().toString(36).toUpperCase()}`;
const LEAGUE = "PPHL Staging League";

function envLocal(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const f = resolve(".env.local");
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 1 || line.startsWith("#")) continue;
      env[line.slice(0, i)] ??= line.slice(i + 1).replace(/^"|"$/g, "");
    }
  }
  return env;
}
let sqlClient: ((q: string, p?: unknown[]) => Promise<any[]>) | null = null;
let sqlEnd: (() => Promise<void>) | null = null;
async function stagingSql<T = Record<string, any>>(q: string, params: unknown[] = []): Promise<T[]> {
  if (!IS_STAGING) throw new Error("stagingSql only runs against staging");
  if (!sqlClient) {
    const postgres = createRequire(resolve("packages/db/package.json"))("postgres");
    const sql = postgres(stagingDbUrl(envLocal()), { max: 1, ssl: "require", prepare: false });
    sqlClient = (qq, p = []) => sql.unsafe(qq, p as any[]);
    sqlEnd = () => sql.end();
  }
  return (await sqlClient(q, params)) as T[];
}
async function adminAuth(method: string, path: string, body?: unknown) {
  const env = envLocal();
  const key = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const r = await supabaseFetch(`${env.STAGING_SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function context(browser: Browser, viewport?: { width: number; height: number }) {
  return browser.newContext({
    ...(IS_STAGING && existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {}),
    ...(viewport ? { viewport } : {})
  });
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUTPUT_DIR}/j22/${name}.png`, fullPage: true }).catch(() => {});
}

test.describe("J22 game-day official", () => {
  test.skip(!IS_STAGING, "J22 mutates data; staging only");
  test.setTimeout(600_000);

  test("J22 journey: crew spot → My games → scoresheet on an iPad", async ({ browser }) => {
    const tag = `${RUN_TAG}J22`;
    const email = `staging-e2e+${tag.toLowerCase()}-keeper@sportspulse.us`;
    const password = `Keep!${tag}x9`;
    const w: Record<string, any> = { teams: [] as Array<{ id: string; name: string; player: string; playerName: string }> };
    try {
      await test.step("0 · setup: throwaway season, two teams, one published game, the keeper's account", async () => {
        const [lg] = await stagingSql(`select id, org_id, sport_code from leagues where name = $1 limit 1`, [LEAGUE]);
        const [s] = await stagingSql(
          `insert into seasons (league_id, org_id, name, sport_code, start_date, end_date, timezone, status)
           values ($1, $2, $3, $4, '2027-01-04', '2027-04-30', 'America/New_York', 'in_progress') returning id`,
          [lg.id, lg.org_id, `${tag} Season`, lg.sport_code]
        );
        w.seasonId = s.id;
        const [d] = await stagingSql(`insert into divisions (season_id, name) values ($1, $2) returning id`, [s.id, `${tag} Div`]);
        w.divisionId = d.id;
        for (const k of ["Home", "Away"]) {
          const [t] = await stagingSql(`insert into teams (org_id, name, sport_code) values ($1, $2, $3) returning id`, [lg.org_id, `${tag} ${k}`, lg.sport_code]);
          await stagingSql(`insert into division_team_entries (division_id, team_id, entry_status) values ($1, $2, 'confirmed')`, [d.id, t.id]);
          const [p] = await stagingSql(`insert into persons (legal_first_name, legal_last_name) values ($1, $2) returning id`, [`${k}Skater`, tag]);
          await stagingSql(`insert into team_memberships (team_id, person_id, season_id, effective_from, current_status, jersey_number) values ($1, $2, $3, now(), 'active', 9)`, [t.id, p.id, s.id]);
          w.teams.push({ id: t.id, name: `${tag} ${k}`, player: p.id, playerName: `${k}Skater ${tag}` });
        }
        const [g] = await stagingSql(
          `insert into games (league_id, season_id, division_id, sport_code, home_team_id, away_team_id, scheduled_start_ts_utc, tz, venue_name, status, published_at, source)
           values ($1, $2, $3, $4, $5, $6, now() + interval '2 days', 'America/New_York', $7, 'scheduled', now(), 'manual') returning id`,
          [lg.id, s.id, d.id, lg.sport_code, w.teams[0].id, w.teams[1].id, `${tag} Arena`]
        );
        w.gameId = g.id;
        const u = await adminAuth("POST", "users", { email, password, email_confirm: true });
        expect(u.status, "setup: keeper account created").toBeLessThan(300);
        w.userId = u.json.id;
        // A brand-new account with no tie to the league and no persons row:
        // the Officials panel's "Add by email" makes the person (step 2).
        const named = await stagingSql(`update profiles set legal_first_name = 'Keeper', legal_last_name = $2 where id = $1 returning id`, [w.userId, tag]);
        expect(named.length, "setup: keeper profile named").toBe(1);
        const none = await stagingSql(`select id from persons where user_id = $1`, [w.userId]);
        expect(none, "setup: keeper has no persons row yet").toEqual([]);
      });

      await test.step("1 · before the crew spot the keeper is turned away", async () => {
        const ctx = await context(browser);
        const page = await ctx.newPage();
        await page.goto(`${E2E_URLS.superadmin}/sign-in`);
        await page.locator("input[type='email']").fill(email);
        await page.locator("input[type='password']").fill(password);
        await page.locator("button[type='submit']").click();
        await expect(page.getByText(/not authorized to access the admin console/i)).toBeVisible({ timeout: 30_000 });
        await ctx.close();
      });

      await test.step("2 · league admin assigns the keeper as scorekeeper (Officials panel)", async () => {
        const ctx = await context(browser);
        const page = await ctx.newPage();
        await signIn(page, E2E_URLS.league, SMOKE_USERS.leagueAdmin);
        await page.goto(`${E2E_URLS.league}/games/${w.gameId}`);
        await page.getByRole("button", { name: /^Assign$/ }).click();
        // The keeper has no role and no tie to the league, so neither the
        // default list (FR-3.9) nor "Show everyone" holds them: the admin
        // adds them by their full account email.
        await expect(page.getByLabel("Person").locator("option").first()).toHaveText(/Pick an official|Loading officials/);
        await page.getByLabel("Show everyone").check();
        expect(
          await page.getByLabel("Person").locator("option", { hasText: `Keeper ${tag}` }).count(),
          "a brand-new account is not in the admin's people list"
        ).toBe(0);
        await page.getByLabel("Add by email").check();
        await page.getByLabel("Role").selectOption("scorekeeper");
        const form = page.locator("form").filter({ has: page.getByLabel("Role") });
        const post = () => page.waitForResponse((r) => r.url().includes(`/games/${w.gameId}/officials`) && r.request().method() === "POST");

        // Unknown email: refused in words, nothing written.
        await page.getByLabel("Account email").fill(`nobody-${tag.toLowerCase()}@sportspulse.us`);
        let resp = post();
        await form.locator('button[type="submit"]').click();
        expect((await resp).status(), "unknown email refused").toBe(404);
        await expect(page.getByText(/No account uses that email/)).toBeVisible({ timeout: 20_000 });

        await page.getByLabel("Account email").fill(email.toUpperCase());
        resp = post();
        await form.locator('button[type="submit"]').click();
        expect((await resp).status(), "crew spot saved").toBe(201);
        await expect(page.getByText(`Keeper ${tag}`).first()).toBeVisible({ timeout: 20_000 });
        const persons = await stagingSql(`select id, legal_first_name, legal_last_name from persons where user_id = $1`, [w.userId]);
        expect(persons.length, "db: one persons row made for the account").toBe(1);
        expect(persons[0].legal_first_name, "db: person named from the profile").toBe("Keeper");
        w.keeperPersonId = persons[0].id;
        const rows = await stagingSql(`select role, status from game_officials where game_id = $1 and person_id = $2 and revoked_at is null`, [w.gameId, w.keeperPersonId]);
        expect(rows, "db: one live scorekeeper row").toEqual([{ role: "scorekeeper", status: "confirmed" }]);
        await ctx.close();
      });

      const ipad = await context(browser, { width: 1024, height: 768 });
      const page = await ipad.newPage();
      await test.step("3 · keeper signs in on an iPad: My games only, nothing else opens", async () => {
        await signIn(page, E2E_URLS.superadmin, email, password);
        await page.waitForURL(/\/games$/, { timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "My games" })).toBeVisible();
        const rows = page.locator(`a[href^="/games/"]`);
        await expect(rows, "exactly the assigned game").toHaveCount(1);
        await expect(rows.first()).toContainText(`${tag} Away`);
        await expect(rows.first()).toContainText(`${tag} Home`);
        expect(await page.locator('a[href="/teams"]').count(), "no module navigation").toBe(0);
        await shot(page, "03-my-games");
        await page.goto(`${E2E_URLS.superadmin}/teams`);
        await page.waitForURL(/\/games$/, { timeout: 30_000 });
      });

      await test.step("4 · keeper runs the scoresheet: start, goal, finalize", async () => {
        await page.locator(`a[href="/games/${w.gameId}"]`).first().click();
        await page.waitForURL(new RegExp(`/games/${w.gameId}`));
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width, "scoresheet fits the iPad width (no side scroll)").toBeLessThanOrEqual(1024);
        await expect(page.getByRole("button", { name: /Reschedule|Move game/i })).toHaveCount(0);
        await page.getByRole("button", { name: /Start play/i }).click();
        await expect(page.getByRole("button", { name: /Log event/i })).toBeVisible({ timeout: 20_000 });
        await page.getByRole("button", { name: /Log event/i }).click();
        const dlg = page.getByRole("dialog");
        await dlg.getByLabel("Event type").selectOption("goal");
        await dlg.getByLabel("Team").selectOption(w.teams[0].id);
        const player = dlg.getByLabel("Player");
        await expect(player.locator(`option[value="${w.teams[0].player}"]`), "home player picked by name").toHaveText(/HomeSkater/, { timeout: 20_000 });
        await player.selectOption(w.teams[0].player);
        await dlg.locator('button[type="submit"]').click();
        await expect(dlg).toBeHidden({ timeout: 20_000 });
        await expect(page.locator("main")).toContainText(w.teams[0].playerName, { timeout: 20_000 });
        await shot(page, "04-in-play");
        await page.getByRole("button", { name: /^Finalize$/ }).click();
        const fd = page.getByRole("dialog");
        await fd.getByRole("radio", { name: /Regulation/ }).check();
        const fin = page.waitForResponse((r) => r.url().includes(`/games/${w.gameId}/finalize`));
        await fd.getByRole("button", { name: /Confirm final score/ }).click();
        expect((await fin).status(), "finalize accepted").toBeLessThan(400);
        const [g] = await stagingSql(`select status, home_score, away_score from games where id = $1`, [w.gameId]);
        expect(g, "db: completed 1-0").toEqual({ status: "completed", home_score: 1, away_score: 0 });
        const lines = await stagingSql(`select person_id from stat_lines where game_id = $1`, [w.gameId]);
        expect(lines.map((l) => l.person_id), "db: the scorer's stat line").toContain(w.teams[0].player);
        await shot(page, "05-final");
      });
      await ipad.close();
    } finally {
      const teamIds = w.teams.map((t: any) => t.id);
      if (w.gameId) {
        await stagingSql(`delete from notifications where payload->>'gameId' = $1`, [w.gameId]).catch(() => {});
        await stagingSql(`delete from games where id = $1`, [w.gameId]).catch(() => {});
      }
      if (teamIds.length) {
        await stagingSql(`delete from standings where team_id = any($1::uuid[])`, [teamIds]).catch(() => {});
        await stagingSql(`delete from team_memberships where team_id = any($1::uuid[])`, [teamIds]).catch(() => {});
        await stagingSql(`delete from division_team_entries where team_id = any($1::uuid[])`, [teamIds]).catch(() => {});
        await stagingSql(`delete from teams where id = any($1::uuid[])`, [teamIds]).catch(() => {});
      }
      if (w.divisionId) await stagingSql(`delete from divisions where id = $1`, [w.divisionId]).catch(() => {});
      if (w.seasonId) await stagingSql(`delete from seasons where id = $1`, [w.seasonId]).catch(() => {});
      await stagingSql(`delete from persons where legal_last_name = $1`, [tag]).catch(() => {});
      if (w.userId) await adminAuth("DELETE", `users/${w.userId}`).catch(() => {});
      await sqlEnd?.();
    }
  });
});
