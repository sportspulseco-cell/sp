import { stagingDbUrl } from "./_helpers";
/**
 * J11 · Game day to stats (UC-11, UC-12, UC-13, UC-30)
 *
 * super_admin creates a fixture through /games (the only game-creation path
 * that works on staging; scheduler Edge Functions are not deployed, SCH-1).
 * captain @ team-admin-web /lineups/[gameId] sets a lineup. super_admin @
 * superadmin-web /games/[id] starts play, logs goal + assist + penalty,
 * applies the score and finalizes (league_admin starts play, SCH-12).
 * Finalize itself writes stat lines, standings and notices (SCH-17). Then superadmin /stats, team-admin /stats
 * and player-web /stats (fresh contexts) must attribute the goal correctly.
 *
 * Bugs: doc/testing/bugs/schedule.md (SCH-N).
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Browser, Page } from "@playwright/test";
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
  await page.screenshot({ path: `${OUTPUT_DIR}/j11/${name}.png`, fullPage: true }).catch(() => {});
}
const BASE_TEAM = "Staging Skaters";
const SEASON_NAME = "Staging 2026-27";
const PLAYER_EMAIL = SMOKE_USERS.player;

test.describe("J11 game day to stats", () => {
  test.skip(!IS_STAGING, "J11 mutates data; staging only");
  test.setTimeout(900_000);

  test("J11 journey: lineup → events → finalize → stats", async ({ browser }) => {
    const sa = await signedInAs(browser, "superAdmin");
    const saErr = watchErrors(sa.page);
    const { page, app } = sa;
    const oppName = `${RUN_TAG} Bears`;
    let oppId = "";
    let gameId = "";
    // Read-only lookup of the base fixtures used as evidence targets.
    const [skaters] = await stagingSql<{ id: string }>(`select id from teams where name = $1 and deleted_at is null`, [BASE_TEAM]);
    const [player] = await stagingSql<{ id: string; name: string }>(
      `select p.id, coalesce(p.preferred_name, p.legal_first_name || ' ' || p.legal_last_name) as name
         from persons p join auth.users u on u.id = p.user_id where lower(u.email) = lower($1) limit 1`, [PLAYER_EMAIL]);
    const roster = await stagingSql<{ person_id: string; name: string }>(
      `select m.person_id, coalesce(p.preferred_name, p.legal_first_name || ' ' || p.legal_last_name) as name,
              m.season_id, m.current_status, m.membership_type
         from team_memberships m join persons p on p.id = m.person_id
        where m.team_id = $1 and (m.effective_to is null or m.effective_to > now())`, [skaters?.id]);
    console.log(`[J11] skaters=${skaters?.id} player=${JSON.stringify(player)} roster=${JSON.stringify(roster)}`);
    const scorer = player ?? (roster[0] ? { id: roster[0].person_id, name: roster[0].name } : undefined);
    const assister = roster.find((r: any) => r.person_id !== scorer?.id && r.current_status === "active");

    await test.step("1 · create opponent team + game via /games (fixture setup through UI)", async () => {
      await page.goto(`${app}/teams`);
      oppId = await createTeamViaUi(page, oppName, "J11");
      // A game is between two teams of one division (SCH-5): place the new
      // team in the season's division from the division page (SCH-4).
      const [div] = await stagingSql<{ id: string }>(
        `select d.id from divisions d join seasons s on s.id = d.season_id
          where s.name = $1 and s.deleted_at is null and d.deleted_at is null
            and exists (select 1 from division_team_entries e where e.division_id = d.id and e.team_id = $2 and e.left_at is null)
          limit 1`,
        [SEASON_NAME, skaters!.id]
      );
      await page.goto(`${app}/divisions/${div!.id}`);
      await page.getByRole("button", { name: "Add a team" }).click();
      await page.getByLabel("Search teams").fill(oppName.slice(0, 6));
      await page.getByRole("option", { name: oppName }).click();
      await page.getByRole("button", { name: "Add to division" }).click();
      await expect(page.getByText(`${oppName} is now in`)).toBeVisible({ timeout: 20_000 });
      await page.goto(`${app}/games`);
      await page.getByRole("button", { name: /New game/i }).first().click();
      const d = new Date(Date.now() + 3 * 86400_000);
      // Any rink of the organisation will do for game-day checks.
      await scheduleGame(page, {
        league: "PPHL Staging League",
        season: SEASON_NAME,
        divisionId: div!.id,
        away: oppName,
        home: BASE_TEAM,
        rink: null,
        startLocal: `${d.toISOString().slice(0, 10)}T20:00`,
        tag: "J11"
      });
      const [g] = await stagingSql<{ id: string }>(`select id from games where away_team_id = $1 order by created_at desc limit 1`, [oppId]);
      gameId = g?.id ?? "";
      expect(gameId, "game row persisted").not.toBe("");
    });

    await test.step("2 · captain sets lineup @ team-admin /lineups/[gameId]", async () => {
      const cap = await signedInAs(browser, "teamAdmin");
      const capErr = watchErrors(cap.page);
      await cap.page.goto(`${cap.app}/`);
      expect.soft(await cap.page.locator('a[href="/lineups"]').count(), "Lineups in captain sidebar").toBeGreaterThan(0);
      await cap.page.goto(`${cap.app}/lineups`);
      const row = cap.page.locator(`a[href="/lineups/${gameId}"]`);
      await expect(row, "game listed on captain /lineups").toBeVisible({ timeout: 20_000 });
      const rowText = await row.innerText();
      console.log(`[J11] captain lineups row: ${rowText.replace(/\s+/g, " ")}`);
      expect.soft(rowText, "SCH-11 opponent shown by name on /lineups").toContain(oppName);
      await row.click();
      await cap.page.waitForURL(new RegExp(`/lineups/${gameId}`));
      await cap.page.waitForLoadState("networkidle").catch(() => {});
      const starterRadios = cap.page.getByRole("radio", { name: /· starters$/ });
      const n = await starterRadios.count();
      const activeIds = new Set(roster.filter((r: any) => r.current_status === "active").map((r) => r.person_id));
      console.log(`[J11] captain lineup roster rows: ${n}; active distinct roster persons in DB: ${activeIds.size}`);
      const lineupText = await cap.page.locator("main").innerText();
      // SCH-23: the editor loads the roster of the team's latest-starting season
      // (captain-roster loadActiveSeason), not the game's season.
      expect.soft(lineupText, "SCH-23 lineup editor lists the Staging 2026-27 rostered player").toContain(scorer?.name ?? "???");
      for (let i = 0; i < n; i++) await starterRadios.nth(i).check();
      await cap.page.getByRole("button", { name: /Save lineup/i }).click();
      await expect.soft(cap.page.getByText(/Last saved/i).first(), "lineup save confirmed on same screen").toBeVisible({ timeout: 15_000 });
      await cap.page.screenshot({ path: `${OUTPUT_DIR}/j11/02-lineup.png`, fullPage: true });
      const lu = await stagingSql<{ lineup: any; submitted_at: string }>(`select lineup, submitted_at from game_lineups where game_id = $1 and team_id = $2`, [gameId, skaters?.id]);
      console.log(`[J11] lineup row: ${JSON.stringify(lu[0]?.lineup)}`);
      expect.soft(lu.length, "lineup persisted").toBe(1);
      console.log(`[J11] captain errors: ${capErr.join(" | ")}`);
      await cap.context.close();
    });

    await test.step("3 · league_admin starts the game (UC-11 role check, SCH-12)", async () => {
      const la = await signedInAs(browser, "leagueAdmin");
      const laErr = watchErrors(la.page);
      await la.page.goto(`${la.app}/games/${gameId}`);
      await la.page.waitForLoadState("networkidle").catch(() => {});
      const start = la.page.getByRole("button", { name: /Start play/i });
      const visible = await start.isVisible().catch(() => false);
      let outcome = "Start play not visible";
      if (visible) {
        const resp = la.page.waitForResponse((r) => r.url().includes(`/games/${gameId}/start`), { timeout: 20_000 }).catch(() => null);
        await start.click();
        const r = await resp;
        outcome = r ? `http ${r.status()} ${(await r.text().catch(() => "")).slice(0, 200)}` : "no request";
        await la.page.waitForTimeout(1500);
      }
      const main = await la.page.locator("main").innerText().catch(() => "");
      console.log(`[J11] league_admin start → ${outcome}; page shows: ${main.replace(/\s+/g, " ").slice(0, 300)}`);
      await la.page.screenshot({ path: `${OUTPUT_DIR}/j11/03-league-admin-start.png`, fullPage: true });
      expect(visible, "SCH-12 Start play shown to the league admin").toBe(true);
      expect(outcome, "SCH-12 league admin (scorekeeper stand-in) can run the scoresheet").toMatch(/^http 2/);
      console.log(`[J11] league_admin errors: ${laErr.join(" | ")}`);
      await la.context.close();
    });

    await test.step("4 · super_admin logs goal (with assist) + penalty, applies score", async () => {
      await page.goto(`${app}/games/${gameId}`);
      // The league admin started play in step 3; only start here if that failed.
      const start = page.getByRole("button", { name: /Start play/i });
      if (await start.isVisible().catch(() => false)) {
        const startResp = page.waitForResponse((r) => r.url().includes(`/games/${gameId}/start`), { timeout: 20_000 }).catch(() => null);
        await start.click();
        const sr = await startResp;
        console.log(`[J11] super_admin start → ${sr ? sr.status() : "no request"}`);
      }
      const logBtn = page.getByRole("button", { name: /Log event/i });
      const refreshed = await logBtn.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
      expect.soft(refreshed, "game page shows in_play controls without a manual reload").toBe(true);
      if (!refreshed) await page.reload();
      await expect(logBtn).toBeVisible({ timeout: 20_000 });
      const lockRow = await stagingSql<{ locked_at: string | null }>(`select locked_at from game_lineups where game_id = $1`, [gameId]);
      expect.soft(lockRow[0]?.locked_at, "lineup locked at start").toBeTruthy();

      async function logEvent(type: string, personId: string | undefined, period = 1) {
        await page.getByRole("button", { name: /Log event/i }).click();
        const dlg = page.getByRole("dialog");
        await dlg.getByLabel("Event type").selectOption(type);
        await dlg.getByLabel("Team").selectOption({ index: 1 }); // home = Skaters
        const sel = dlg.getByLabel("Player");
        await expect(sel).toBeEnabled({ timeout: 20_000 });
        const opts = await sel.locator("option").allInnerTexts();
        const hasPerson = personId ? (await sel.locator(`option[value="${personId}"]`).count()) > 0 : false;
        // SCH-22: the Player picker is empty ("No persons found") because the
        // dialog calls iam.listPersons({ limit: 200 }) and the API caps limit at 100 (400).
        expect.soft(hasPerson, `SCH-22 rostered player selectable for ${type}`).toBe(true);
        if (hasPerson) await sel.selectOption(personId!);
        else console.log(`[J11] ${type}: player ${personId} not in picker; logging unattributed (blocked)`);
        const extra = {
          assistField: await dlg.getByLabel(/^Assist 1$/).count(),
          minutesField: await dlg.getByLabel(/^(Minutes|Infraction)$/).count()
        };
        // SCH-13: assists ride on the goal. SCH-14: penalty infraction + minutes.
        if (type === "goal" && extra.assistField > 0 && assister) {
          const a1 = dlg.getByLabel(/^Assist 1$/);
          if ((await a1.locator(`option[value="${assister.person_id}"]`).count()) > 0) await a1.selectOption(assister.person_id);
          else console.log(`[J11] assister ${assister.person_id} not in Assist 1 picker`);
        }
        if (type === "penalty" && extra.minutesField > 0) {
          await dlg.getByLabel(/^Infraction$/).selectOption("tripping");
          await dlg.getByLabel(/^Minutes$/).selectOption("2");
        }
        await dlg.getByLabel("Period").fill(String(period));
        await dlg.locator('button[type="submit"]').click();
        await expect(dlg).toBeHidden({ timeout: 20_000 });
        return { opts, extra };
      }
      const goal = await logEvent("goal", scorer?.id);
      console.log(`[J11] home player options: ${goal.opts.length} → ${goal.opts.slice(0, 8).join(" | ")}`);
      expect(goal.extra.assistField, "SCH-13 goal dialog has assist picker(s)").toBeGreaterThan(0);
      // "assist" is no longer its own event type (it would double count).
      const pen = await logEvent("penalty", scorer?.id, 2);
      expect(pen.extra.minutesField, "SCH-14 penalty dialog has infraction/minutes").toBeGreaterThan(0);

      await page.waitForTimeout(2000);
      const logText = await page.locator("main").innerText();
      expect.soft(logText, "events appear on the same screen").toMatch(/penalty/i);
      expect.soft(logText, "SCH-15 event log shows the scorer's name").toContain(scorer?.name ?? "???");
      const score = logText.match(/(\d+)\s*[–-]\s*(\d+)/)?.[0];
      console.log(`[J11] score shown after logging a goal: ${score}`);
      expect.soft(score, "SCH-16 goal event updates the score (away–home 0–1)").toMatch(/0\s*[–-]\s*1/);
      await page.getByRole("button", { name: /Apply score/i }).click();
      const sd = page.getByRole("dialog");
      await sd.getByLabel("Away").fill("0");
      await sd.getByLabel("Home").fill("1");
      await sd.getByLabel("Period").fill("3");
      await sd.locator('button[type="submit"]').click();
      await expect(sd).toBeHidden({ timeout: 20_000 });
      await shot(page, "04-events");
    });

    await test.step("5 · officials (UC-30) + finalize (UC-12)", async () => {
      const assign = page.getByRole("button", { name: /^Assign$/ }).first();
      console.log(`[J11] officials Assign button visible: ${await assign.isVisible().catch(() => false)}`);
      // UC-12 review step: the dialog shows the final score and asks how the game ended.
      await page.getByRole("button", { name: /^Finalize$/ }).click();
      const fd = page.getByRole("dialog");
      await expect(fd.getByText(/How did the game end/), "finalize review step").toBeVisible({ timeout: 10_000 });
      await fd.getByRole("radio", { name: /Regulation/ }).check();
      const finResp = page.waitForResponse((r) => r.url().includes(`/games/${gameId}/finalize`), { timeout: 30_000 });
      await fd.getByRole("button", { name: /Confirm final score/ }).click();
      const fr = await finResp;
      console.log(`[J11] finalize → ${fr.status()} ${(await fr.text().catch(() => "")).slice(0, 300)}`);
      expect(fr.status(), "finalize accepted").toBeLessThan(400);
      await expect(fd).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText(/^Final\. /).first(), "finalize summary shown on the same screen").toBeVisible({ timeout: 20_000 });
      const [g] = await stagingSql<{ status: string; finalized_at: string | null; home_score: number; away_score: number }>(
        `select status, finalized_at, home_score, away_score from games where id = $1`, [gameId]);
      console.log(`[J11] game after finalize: ${JSON.stringify(g)}`);
      expect(g?.status).toBe("completed");
      const lines = await stagingSql(`select person_id, core from stat_lines where game_id = $1`, [gameId]);
      console.log(`[J11] stat_lines right after finalize: ${lines.length}`);
      expect(lines.length, "SCH-17 finalize triggers stat projection (UC-13)").toBeGreaterThan(0);
      const notif = await stagingSql<{ recipient_person_id: string | null; payload: any; status: string }>(
        `select template_code, payload, recipient_person_id, status from notifications where idempotency_key like $1`, [`game.finalized:${gameId}%`]);
      console.log(`[J11] game.finalized notifications: ${JSON.stringify(notif).slice(0, 600)}`);
      expect(notif.length, "SCH-17 finalize queues notices for both teams").toBeGreaterThan(0);
      expect(notif.every((n) => n.recipient_person_id), "SCH-17 every notice has a recipient").toBe(true);
      expect(notif[0]?.payload?.homeTeam, "SCH-17 notice names the team, not an id").toBe(BASE_TEAM);
      await shot(page, "05-finalized");
    });

    await test.step("6 · Project stats + standings (manual fallback) and superadmin /stats", async () => {
      await page.goto(`${app}/games/${gameId}`);
      const proj = page.getByRole("button", { name: /Project stats/i });
      if (await proj.isVisible().catch(() => false)) { await proj.click(); await page.waitForTimeout(4000); }
      const lines = await stagingSql<{ person_id: string; core: any }>(`select person_id, core from stat_lines where game_id = $1`, [gameId]);
      console.log(`[J11] stat_lines after Project stats: ${JSON.stringify(lines)}`);
      const sLine = lines.find((l) => l.person_id === scorer?.id);
      expect(sLine?.core?.goals, "goal attributed to the scorer").toBe(1);
      const aLine = lines.find((l) => l.person_id === assister?.person_id);
      expect(aLine?.core?.assists ?? 0, "SCH-13 assist counted").toBeGreaterThan(0);
      expect(sLine?.core?.pim ?? 0, "SCH-14 penalty minutes counted").toBe(2);

      await page.goto(`${app}/stats`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const saText = await page.locator("main").innerText();
      await shot(page, "06-sa-player-lines");
      console.log(`[J11] superadmin /stats: ${saText.replace(/\s+/g, " ").slice(0, 600)}`);
      expect.soft(saText, "superadmin /stats lists the scorer").toContain(scorer?.name ?? "???");
      const [lg] = await stagingSql<{ id: string }>(`select league_id as id from games where id = $1`, [gameId]);
      await page.getByRole("link", { name: "PPHL Staging League" }).first().click();
      await page.waitForURL(/leagueId=/);
      const standingsLink = page.getByRole("link", { name: /^Standings$/ }).first();
      if (await standingsLink.isVisible().catch(() => false)) {
        await standingsLink.click();
        await page.waitForURL(/tab=standings/);
        await page.waitForLoadState("networkidle").catch(() => {});
        const rc = page.getByRole("button", { name: /Recompute/i }).first();
        if (await rc.isVisible().catch(() => false)) { await rc.click(); await page.waitForTimeout(4000); }
        await page.reload();
        const st = await page.locator("main").innerText();
        await shot(page, "06-sa-standings");
        console.log(`[J11] superadmin standings: ${st.replace(/\s+/g, " ").slice(0, 600)}`);
        const rows = await stagingSql(`select * from standings where league_id = $1 and team_id = any($2::uuid[])`, [lg?.id, [skaters?.id, oppId]]).catch((e) => [{ error: String(e) }]);
        console.log(`[J11] standings rows (db): ${JSON.stringify(rows).slice(0, 600)}`);
        expect.soft(st, "standings list the base team after Recompute").toMatch(/Skaters/);
      }
      await page.goto(`${app}/game-events`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const ge = await page.locator("main").innerText();
      await shot(page, "06-game-events");
      const [evCount] = await stagingSql<{ n: number; mine: number }>(`select count(*)::int n, count(*) filter (where game_id = $1)::int mine from game_events`, [gameId]);
      console.log(`[J11] game_events total=${evCount?.n} thisGame=${evCount?.mine}; page: ${ge.replace(/\s+/g, " ").slice(0, 300)}`);
      expect.soft(ge, "/game-events lists the goal").toMatch(/goal/i);
      expect.soft(ge, "SCH-15 /game-events shows the scorer's name").toContain(scorer?.name ?? "???");
    });

    await test.step("7 · captain + player stats (fresh contexts)", async () => {
      const cap = await signedInAs(browser, "teamAdmin");
      await cap.page.goto(`${cap.app}/stats`);
      await cap.page.waitForLoadState("networkidle").catch(() => {});
      const capText = await cap.page.locator("main").innerText();
      await cap.page.screenshot({ path: `${OUTPUT_DIR}/j11/07-captain-stats.png`, fullPage: true });
      console.log(`[J11] captain /stats: ${capText.replace(/\s+/g, " ").slice(0, 600)}`);
      expect(capText, "SCH-24 captain /stats shows standings after a finalized game").not.toMatch(/No standings yet/);
      // Player lines are per season; the New game dialog now stores the
      // division's season on the game (SCH-5).
      const [gs] = await stagingSql<{ season_id: string | null }>(`select season_id from games where id = $1`, [gameId]);
      expect(gs?.season_id, "SCH-5 manual game carries a season (needed for season player stats)").not.toBeNull();
      expect(capText, "SCH-24 captain /stats lists the scorer").toContain(scorer?.name ?? "???");
      await cap.page.goto(`${cap.app}/schedule`);
      const capSched = await cap.page.locator("main").innerText();
      expect(capSched, "SCH-7 captain /schedule shows the completed game").toContain(oppName);
      await cap.context.close();

      const pl = await signedInAs(browser, "player");
      await pl.page.goto(`${pl.app}/stats`);
      await pl.page.waitForLoadState("networkidle").catch(() => {});
      const plText = await pl.page.locator("main").innerText();
      await pl.page.screenshot({ path: `${OUTPUT_DIR}/j11/07-player-stats.png`, fullPage: true });
      console.log(`[J11] player /stats: ${plText.replace(/\s+/g, " ").slice(0, 600)}`);
      expect.soft(plText, "player /stats shows games played").not.toMatch(/No stat lines|No stats yet/i);
      await pl.page.goto(`${pl.app}/notifications`);
      await pl.page.waitForLoadState("networkidle").catch(() => {});
      const nText = await pl.page.locator("main").innerText();
      console.log(`[J11] player /notifications: ${nText.replace(/\s+/g, " ").slice(0, 300)}`);
      expect.soft(nText, "SCH-17 player inbox has the final-score notice").toMatch(/Final score|Final:/);
      await pl.context.close();
    });

    console.log(`[J11] RUN_TAG=${RUN_TAG} opp=${oppId} game=${gameId}`);
    console.log(`[J11] superadmin errors:\n  ${saErr.join("\n  ")}`);
    await sa.context.close();
  });
});
