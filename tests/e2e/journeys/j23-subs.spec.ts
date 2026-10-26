import { stagingDbUrl, supabaseFetch } from "./_helpers";
/**
 * J23 · Captain requests a substitute (UC-31, FR-3.3.1, FR-3.3.3)
 *
 * The captain opens "Find a sub" for an upcoming game on the team-admin
 * schedule, sees an eligible free agent with level and positions, and
 * asks them. The free agent signs in to the player app, sees the sub
 * request on Home and accepts: they are on that game's lineup as a guest
 * (game_attendance is_guest, read back from the database). The captain's
 * page shows the request accepted and one guest spot used. The league
 * admin opens the game page, sees the sub, and assigns a second free
 * agent who marked mornings only, with the override recorded.
 *
 * Setup (labelled, removed at the end): a throwaway season, a B division
 * allowing 2 guests, two teams, one published game, the captain and two
 * free agents (accounts, persons, pool entries). The state under test
 * (request, answer, guest row, override) is made only through the UI.
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
const TZ = "America/New_York";

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
async function context(browser: Browser) {
  return browser.newContext(IS_STAGING && existsSync(BYPASS_STATE_PATH) ? { storageState: BYPASS_STATE_PATH } : {});
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUTPUT_DIR}/j23/${name}.png`, fullPage: true }).catch(() => {});
}

test.describe("J23 substitute requests", () => {
  test.skip(!IS_STAGING, "J23 mutates data; staging only");
  test.setTimeout(600_000);

  test("J23 journey: captain asks a sub → player accepts → guest on the game → admin override", async ({ browser }) => {
    const tag = `${RUN_TAG}J23`;
    const password = `Sub!${tag}x9`;
    const mail = (k: string) => `staging-e2e+${tag.toLowerCase()}-${k}@sportspulse.us`;
    const w: Record<string, any> = { users: [] as string[], teams: [] as string[] };
    const account = async (k: string, first: string) => {
      const u = await adminAuth("POST", "users", { email: mail(k), password, email_confirm: true });
      expect(u.status, `setup: ${k} account`).toBeLessThan(300);
      w.users.push(u.json.id);
      const [p] = await stagingSql(`insert into persons (user_id, legal_first_name, legal_last_name) values ($1, $2, $3) returning id`, [u.json.id, first, tag]);
      return { userId: u.json.id as string, personId: p.id as string, email: mail(k), name: `${first} ${tag}` };
    };
    try {
      await test.step("0 · setup: season, B division, two teams, one game, captain and two free agents", async () => {
        const [lg] = await stagingSql(`select id, org_id, sport_code from leagues where name = $1 limit 1`, [LEAGUE]);
        const [s] = await stagingSql(
          `insert into seasons (league_id, org_id, name, sport_code, start_date, end_date, timezone, status)
           values ($1, $2, $3, $4, current_date - 10, current_date + 60, $5, 'in_progress') returning id`,
          [lg.id, lg.org_id, `${tag} Season`, lg.sport_code, TZ]
        );
        w.seasonId = s.id;
        const [d] = await stagingSql(
          `insert into divisions (season_id, name, tier, rule_set_overrides) values ($1, $2, 'B', '{"maxGuestPlayersPerGame":2}'::jsonb) returning id`,
          [s.id, `${tag} Div`]
        );
        w.divisionId = d.id;
        w.cap = await account("cap", "Captain");
        for (const k of ["Home", "Away"]) {
          const [t] = await stagingSql(
            `insert into teams (org_id, name, sport_code, captain_user_id, status) values ($1, $2, $3, $4, 'active') returning id`,
            [lg.org_id, `${tag} ${k}`, lg.sport_code, k === "Home" ? w.cap.userId : null]
          );
          await stagingSql(`insert into division_team_entries (division_id, team_id, entry_status) values ($1, $2, 'confirmed')`, [d.id, t.id]);
          w.teams.push(t.id);
        }
        const [capRole] = await stagingSql(`select id from roles where code = 'captain' limit 1`);
        await stagingSql(`insert into user_role_assignments (user_id, role_id, scope_type, scope_id) values ($1, $2, 'team', $3)`, [w.cap.userId, capRole.id, w.teams[0]]);
        // The captain app's gate reads role_codes from the token; the product's
        // role grant keeps it in sync, a direct insert does not.
        const ac = await adminAuth("PUT", `users/${w.cap.userId}`, { app_metadata: { role_codes: ["captain"], profile_complete: true } });
        expect(ac.status, "setup: captain role code on the account").toBeLessThan(300);
        const [{ day, ts }] = await stagingSql(
          `select to_char((current_date + 3)::timestamp, 'Dy') as day, ((current_date + 3)::timestamp + time '19:30') at time zone $1 as ts`,
          [TZ]
        );
        const [g] = await stagingSql(
          `insert into games (league_id, season_id, division_id, sport_code, home_team_id, away_team_id, scheduled_start_ts_utc, tz, venue_name, status, published_at, source)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', now(), 'manual') returning id`,
          [lg.id, s.id, d.id, lg.sport_code, w.teams[0], w.teams[1], ts, TZ, `${tag} Rink`]
        );
        w.gameId = g.id;
        const [playerRole] = await stagingSql(`select id from roles where code = 'player' limit 1`);
        const freeAgent = async (k: string, first: string, windows: string[]) => {
          const a = await account(k, first);
          await stagingSql(
            `insert into free_agent_pool_entries (player_person_id, season_id, positions, availability, level_primary, status)
             values ($1, $2, $3, ($4::text)::jsonb, 'B', 'active')`,
            [a.personId, s.id, ["D"], JSON.stringify({ [day]: windows })]
          );
          await stagingSql(`insert into user_role_assignments (user_id, role_id, scope_type, scope_id) values ($1, $2, 'division', $3)`, [a.userId, playerRole.id, d.id]);
          return a;
        };
        w.fa = await freeAgent("fa", "Freeagent", ["EVE"]);
        w.early = await freeAgent("early", "Earlybird", ["AM"]);
      });

      await test.step("1 · captain: Schedule → Find a sub → ask the free agent", async () => {
        const ctx = await context(browser);
        const page = await ctx.newPage();
        await signIn(page, E2E_URLS.teamAdmin, w.cap.email, password);
        await page.goto(`${E2E_URLS.teamAdmin}/schedule`);
        await page.locator(`a[href="/schedule/${w.gameId}/subs"]`).click();
        await page.waitForURL(new RegExp(`/schedule/${w.gameId}/subs`));
        await expect(page.getByText(/0 of 2 used/)).toBeVisible({ timeout: 30_000 });
        const row = page.locator("li").filter({ hasText: w.fa.name });
        await expect(row, "free agent listed with level and position").toContainText(/B .*Defense.*Free agent/);
        await expect(page.locator("li").filter({ hasText: w.early.name }), "mornings-only player is not offered").toHaveCount(0);
        await row.getByRole("button", { name: "Ask to sub" }).click();
        await expect(page.getByText(`Request sent to ${w.fa.name}`)).toBeVisible({ timeout: 20_000 });
        await expect(page.locator("li").filter({ hasText: w.fa.name }).getByText("Waiting for answer")).toBeVisible();
        const rows = await stagingSql(`select status from substitute_requests where game_id = $1 and substitute_person_id = $2`, [w.gameId, w.fa.personId]);
        expect(rows, "db: one open request").toEqual([{ status: "requested" }]);
        await shot(page, "01-captain-asked");
        await ctx.close();
      });

      await test.step("2 · free agent: Home → Sub requests → Accept", async () => {
        const ctx = await context(browser);
        const page = await ctx.newPage();
        await signIn(page, E2E_URLS.player, w.fa.email, password);
        const card = page.getByRole("region", { name: "Sub requests" });
        await expect(card).toContainText(`${tag} Home`, { timeout: 30_000 });
        await card.getByRole("button", { name: "Accept" }).click();
        await expect(card).toContainText(`You are on the ${tag} Home lineup`, { timeout: 20_000 });
        const att = await stagingSql(`select is_guest, team_id from game_attendance where game_id = $1 and person_id = $2`, [w.gameId, w.fa.personId]);
        expect(att, "db: guest on the game for the home team").toEqual([{ is_guest: true, team_id: w.teams[0] }]);
        const [req] = await stagingSql(`select status from substitute_requests where game_id = $1 and substitute_person_id = $2`, [w.gameId, w.fa.personId]);
        expect(req.status, "db: request accepted").toBe("accepted");
        await shot(page, "02-player-accepted");
        await ctx.close();
      });

      await test.step("3 · captain sees the answer", async () => {
        const ctx = await context(browser);
        const page = await ctx.newPage();
        await signIn(page, E2E_URLS.teamAdmin, w.cap.email, password);
        await page.goto(`${E2E_URLS.teamAdmin}/schedule/${w.gameId}/subs`);
        await expect(page.getByText(/1 of 2 used/)).toBeVisible({ timeout: 30_000 });
        await expect(page.locator("li").filter({ hasText: w.fa.name }).getByText("Accepted").first()).toBeVisible();
        await ctx.close();
      });

      await test.step("4 · league admin: game page → Subs → assign with override", async () => {
        const ctx = await context(browser);
        const page = await ctx.newPage();
        await signIn(page, E2E_URLS.league, SMOKE_USERS.leagueAdmin);
        await page.goto(`${E2E_URLS.league}/games/${w.gameId}`);
        await expect(page.getByText("Guests and sub requests")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(w.fa.name).first()).toBeVisible({ timeout: 30_000 });
        const away = page.locator("div.rounded-lg").filter({ hasText: `${tag} Away` });
        const option = away.locator("select option").filter({ hasText: w.early.name });
        await away.locator("select").selectOption(await option.getAttribute("value") as string);
        await expect(away.getByText(/with an override/)).toBeVisible();
        await away.getByRole("button", { name: "Assign sub" }).click();
        await expect(page.getByText(`${w.early.name} added to ${tag} Away as a sub`)).toBeVisible({ timeout: 20_000 });
        await expect(away.getByText("Admin override")).toBeVisible();
        const [ov] = await stagingSql(
          `select r.roster_override, a.is_guest, a.team_id from substitute_requests r join game_attendance a on a.id = r.attendance_id where r.game_id = $1 and r.substitute_person_id = $2`,
          [w.gameId, w.early.personId]
        );
        expect(ov, "db: override recorded, guest for the away team").toEqual({ roster_override: true, is_guest: true, team_id: w.teams[1] });
        await shot(page, "04-admin-override");
        await ctx.close();
      });
    } finally {
      if (w.gameId) {
        await stagingSql(`delete from notifications where payload->>'gameId' = $1`, [w.gameId]).catch(() => {});
        await stagingSql(`delete from substitute_requests where game_id = $1`, [w.gameId]).catch(() => {});
        await stagingSql(`delete from game_attendance where game_id = $1`, [w.gameId]).catch(() => {});
        await stagingSql(`delete from games where id = $1`, [w.gameId]).catch(() => {});
      }
      if (w.teams.length) {
        await stagingSql(`delete from roster_moves where team_id = any($1::uuid[])`, [w.teams]).catch(() => {});
        await stagingSql(`delete from user_role_assignments where scope_type = 'team' and scope_id = any($1::uuid[])`, [w.teams]).catch(() => {});
        await stagingSql(`delete from division_team_entries where team_id = any($1::uuid[])`, [w.teams]).catch(() => {});
        await stagingSql(`delete from teams where id = any($1::uuid[])`, [w.teams]).catch(() => {});
      }
      if (w.divisionId) await stagingSql(`delete from user_role_assignments where scope_type = 'division' and scope_id = $1`, [w.divisionId]).catch(() => {});
      if (w.seasonId) await stagingSql(`delete from free_agent_pool_entries where season_id = $1`, [w.seasonId]).catch(() => {});
      if (w.divisionId) await stagingSql(`delete from divisions where id = $1`, [w.divisionId]).catch(() => {});
      if (w.seasonId) await stagingSql(`delete from seasons where id = $1`, [w.seasonId]).catch(() => {});
      await stagingSql(`delete from notifications where recipient_person_id in (select id from persons where legal_last_name = $1)`, [tag]).catch(() => {});
      await stagingSql(`delete from persons where legal_last_name = $1`, [tag]).catch(() => {});
      for (const u of w.users) await adminAuth("DELETE", `users/${u}`).catch(() => {});
      await sqlEnd?.();
    }
  });
});
