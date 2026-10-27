import { expect, test } from "@playwright/test";
import { E2E_URLS, SMOKE_USERS, smokePasswordFor } from "../fixtures";
import { IS_STAGING, RUN_TAG, signedInAs, stagingSql } from "./_helpers";
import { accessToken, STAGING_API } from "./_register-team";

/**
 * PPHL full-season test findings F-6 and F-7 (doc/test-reports, 26 Oct 2026).
 *
 * F-6: registration and roster-lock dates follow one rule on create and
 * edit. A date moved into the past is refused in the dialog and by the
 * API; a date already saved in the past still saves.
 *
 * F-7: finalizing a tied game as a shootout asks who won it, and finalize
 * adds the winner's one shootout goal on the server.
 *
 * Setup (a game in play, tied 1-1) goes through the same API the game
 * page calls; the decisions under test are clicked in the browser and
 * read back from the database.
 */

// The PPHL full-season test season on staging: registration opened 26 Oct.
const SEASON = "555c9260-f17b-4705-9636-2bdae848782f";

let token = "";
async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`${STAGING_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

const ymdDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test.describe("PPHL F-6 / F-7", () => {
  test.skip(!IS_STAGING, "mutates data; staging only");
  test.setTimeout(240_000);

  test.beforeAll(async () => {
    token = await accessToken(SMOKE_USERS.superAdmin, smokePasswordFor(SMOKE_USERS.superAdmin));
  });

  test("F-6 · a registration date moved into the past is refused; a saved one stays", async ({ browser }) => {
    const [before] = await stagingSql<{ opens: Date; updated_at: Date }>(
      `select registration_opens_at opens, updated_at from seasons where id = $1`, [SEASON]);
    expect(before?.opens, "fixture season has a past opening date").toBeTruthy();
    expect(new Date(before!.opens).getTime()).toBeLessThan(Date.now());

    // API: the same rule as create.
    const moved = await api("PATCH", `/league/seasons/${SEASON}`, { registrationOpensAt: `${ymdDaysAgo(10)}T05:00:00.000Z` });
    console.log(`[F-6] PATCH opens=-10d -> ${moved.status} ${moved.text.slice(0, 160)}`);
    expect(moved.status, "API refuses a date moved into the past").toBeGreaterThanOrEqual(400);
    expect(moved.text).toContain("Registration cannot open in the past.");

    const { context, page } = await signedInAs(browser, "superAdmin");
    await page.goto(`${E2E_URLS.superadmin}/seasons/${SEASON}`);
    await page.getByRole("button", { name: "Edit season" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText("Today or later. Today opens it now.")).toBeVisible();

    // Dialog: moving the date back is refused before any request.
    const opens = dlg.getByLabel("Registration opens", { exact: true });
    const saved = await opens.inputValue();
    await opens.fill(ymdDaysAgo(10));
    await dlg.getByRole("button", { name: "Save season" }).click();
    await expect(dlg.getByText("Registration cannot open in the past.")).toBeVisible();

    // Dialog: the saved past date saves unchanged.
    await opens.fill(saved);
    const resp = page.waitForResponse((r) => r.url().includes(`/league/seasons/${SEASON}`) && r.request().method() === "PATCH");
    await dlg.getByRole("button", { name: "Save season" }).click();
    const r = await resp;
    console.log(`[F-6] save unchanged -> ${r.status()}`);
    expect(r.status(), "a date already saved in the past still saves").toBeLessThan(400);
    await expect(dlg).toBeHidden({ timeout: 20_000 });

    const [after] = await stagingSql<{ opens: Date; updated_at: Date }>(
      `select registration_opens_at opens, updated_at from seasons where id = $1`, [SEASON]);
    console.log(`[F-6] opens before ${new Date(before!.opens).toISOString()} after ${new Date(after!.opens).toISOString()}`);
    expect(new Date(after!.opens).toISOString(), "an untouched date is not rewritten").toBe(new Date(before!.opens).toISOString());
    await context.close();
  });

  test("F-7 · a tied game finalized as a shootout gets the winner's goal", async ({ browser }) => {
    const [tpl] = await stagingSql<{ league_id: string; division_id: string; home_team_id: string; away_team_id: string; surface_id: string }>(
      `select league_id, division_id, home_team_id, away_team_id, surface_id from games
        where season_id = $1 and surface_id is not null order by created_at limit 1`, [SEASON]);
    expect(tpl, "fixture season has a game to copy teams from").toBeTruthy();
    const [home] = await stagingSql<{ name: string }>(`select name from teams where id = $1`, [tpl!.home_team_id]);

    const ny = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const created = await api("POST", "/games", {
      leagueId: tpl!.league_id, divisionId: tpl!.division_id, homeTeamId: tpl!.home_team_id, awayTeamId: tpl!.away_team_id,
      surfaceId: tpl!.surface_id, startLocal: `${ny}T05:${String(10 + Math.floor(Math.random() * 40)).padStart(2, "0")}`,
      force: true, reason: `${RUN_TAG} F-7 shootout check`
    });
    console.log(`[F-7] create game -> ${created.status} ${created.text.slice(0, 200)}`);
    expect(created.status).toBeLessThan(400);
    const gameId = (created.json?.data ?? created.json)?.id as string;

    const started = await api("POST", `/games/${gameId}/start`, {});
    console.log(`[F-7] start -> ${started.status} ${started.text.slice(0, 160)}`);
    expect(started.status).toBeLessThan(400);
    for (const teamId of [tpl!.home_team_id, tpl!.away_team_id]) {
      const g = await api("POST", "/game-events", { gameId, eventType: "goal", teamId, period: 1, idempotencyKey: `${RUN_TAG}-f7-${teamId}` });
      console.log(`[F-7] goal -> ${g.status} ${g.text.slice(0, 160)}`);
      expect(g.status).toBeLessThan(400);
    }

    // A winner on a decided ending is refused, and nothing changes.
    const wrong = await api("POST", `/games/${gameId}/finalize`, { endedIn: "regulation", shootoutWinner: "home" });
    console.log(`[F-7] winner without shootout -> ${wrong.status} ${wrong.text.slice(0, 160)}`);
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const { context, page } = await signedInAs(browser, "superAdmin");
    await page.goto(`${E2E_URLS.superadmin}/games/${gameId}`);
    await page.getByRole("button", { name: /^Finalize$/ }).click();
    const fd = page.getByRole("dialog");
    await expect(fd.getByText(/How did the game end/)).toBeVisible({ timeout: 15_000 });
    await fd.getByRole("radio", { name: /Shootout/ }).check();
    await expect(fd.getByText(/Shootout goals are not logged/)).toBeVisible();
    const confirm = fd.getByRole("button", { name: /Confirm final score/ });
    await expect(confirm, "needs a shootout winner first").toBeDisabled();
    await fd.getByRole("radio", { name: home!.name }).check();
    await expect(fd.getByText("Final score will be 1 – 2.")).toBeVisible();
    const fin = page.waitForResponse((r) => r.url().includes(`/games/${gameId}/finalize`));
    await confirm.click();
    const fr = await fin;
    console.log(`[F-7] finalize -> ${fr.status()} ${(await fr.text().catch(() => "")).slice(0, 200)}`);
    expect(fr.status()).toBeLessThan(400);
    await expect(fd).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(/^Final\. /).first()).toBeVisible({ timeout: 20_000 });

    const [g] = await stagingSql<{ status: string; home_score: number; away_score: number; ended: string | null }>(
      `select status, home_score, away_score, metadata->>'endedIn' ended from games where id = $1`, [gameId]);
    console.log(`[F-7] game after finalize: ${JSON.stringify(g)}`);
    expect(g).toEqual({ status: "completed", home_score: 2, away_score: 1, ended: "shootout" });
    await context.close();
  });
});
