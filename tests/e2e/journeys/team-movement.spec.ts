import { test, expect, type Page } from "@playwright/test";
import { E2E_URLS } from "../fixtures";
import { signedInAs, stagingSql, IS_STAGING, RUN_TAG } from "./_helpers";

/**
 * SP-Changes item 8: team movement (PPHL review call, 23-24 Oct 2026).
 * Seeds an isolated league under the staging org, then drives the real
 * "Move team" dialog as super admin and reads the database back after
 * every move. Rules A (rollover) and B (division shift) are exercised in
 * the browser; the duplicate-move refusal is the unhappy path.
 */
test.skip(!IS_STAGING, "staging only");
test.describe.configure({ mode: "serial" });

const TAG = `${RUN_TAG}MV`;
const ORG_ID = "f7e62723-7685-4ba0-80e5-310c266c7b81"; // Staging Skaters' org
const SPORT = "HOCKEY_ICE";

const seed = {
  leagueId: "",
  s1: "",
  s2: "",
  s1a: "",
  s1b: "",
  s2a: "",
  team: "",
  rival: "",
  entry: "",
  persons: [] as string[],
  memberships: 0
};

function logApiErrors(page: Page) {
  page.on("response", (r) => {
    if (r.status() >= 400 && /staging-api/.test(r.url()))
      console.log(`[move] ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

test.beforeAll(async () => {
  const [league] = await stagingSql<{ id: string }>(
    `insert into leagues (org_id, sport_code, name, status) values ($1, $2, $3, 'active') returning id`,
    [ORG_ID, SPORT, `${TAG} League`]
  );
  seed.leagueId = league!.id;
  const [s1] = await stagingSql<{ id: string }>(
    `insert into seasons (org_id, league_id, name, sport_code, start_date, end_date, status)
     values ($1, $2, $3, $4, '2026-10-01', '2027-03-31', 'in_progress') returning id`,
    [ORG_ID, seed.leagueId, `${TAG} Season 2026`, SPORT]
  );
  const [s2] = await stagingSql<{ id: string }>(
    `insert into seasons (org_id, league_id, name, sport_code, start_date, end_date, status)
     values ($1, $2, $3, $4, '2027-10-01', '2028-03-31', 'draft') returning id`,
    [ORG_ID, seed.leagueId, `${TAG} Season 2027`, SPORT]
  );
  seed.s1 = s1!.id;
  seed.s2 = s2!.id;
  const divs = await stagingSql<{ id: string; name: string }>(
    `insert into divisions (season_id, name, tier, max_teams) values
       ($1, $3, 'A', 10), ($1, $4, 'B', 10), ($2, $5, 'A', 10) returning id, name`,
    [seed.s1, seed.s2, `${TAG} A 2026`, `${TAG} B 2026`, `${TAG} A 2027`]
  );
  seed.s1a = divs.find((d) => d.name === `${TAG} A 2026`)!.id;
  seed.s1b = divs.find((d) => d.name === `${TAG} B 2026`)!.id;
  seed.s2a = divs.find((d) => d.name === `${TAG} A 2027`)!.id;
  const teams = await stagingSql<{ id: string; name: string }>(
    `insert into teams (org_id, name, sport_code) values ($1, $2, $3), ($1, $4, $3) returning id, name`,
    [ORG_ID, `${TAG} Movers`, SPORT, `${TAG} Rivals`]
  );
  seed.team = teams.find((t) => t.name === `${TAG} Movers`)!.id;
  seed.rival = teams.find((t) => t.name === `${TAG} Rivals`)!.id;
  const entries = await stagingSql<{ id: string; team_id: string }>(
    `insert into division_team_entries (division_id, team_id, entry_status) values
       ($1, $2, 'confirmed'), ($1, $3, 'confirmed') returning id, team_id`,
    [seed.s1a, seed.team, seed.rival]
  );
  seed.entry = entries.find((e) => e.team_id === seed.team)!.id;
  const persons = await stagingSql<{ id: string }>(
    `insert into persons (legal_first_name, legal_last_name) values ($1, 'Mover'), ($2, 'Mover') returning id`,
    [`${TAG} One`, `${TAG} Two`]
  );
  seed.persons = persons.map((p) => p.id);
  const ms = await stagingSql<{ id: string }>(
    `insert into team_memberships (team_id, person_id, season_id, effective_from, jersey_number)
     values ($1, $2, $3, now(), 7), ($1, $4, $3, now(), 9) returning id`,
    [seed.team, seed.persons[0], seed.s1, seed.persons[1]]
  );
  seed.memberships = ms.length;
  // One played game, so the division shift is the mid-season kind.
  await stagingSql(
    `insert into games (league_id, season_id, division_id, home_team_id, away_team_id, sport_code,
       scheduled_start_ts_utc, status, home_score, away_score)
     values ($1, $2, $3, $4, $5, $6, now() - interval '7 days', 'completed', 3, 1)`,
    [seed.leagueId, seed.s1, seed.s1a, seed.team, seed.rival, SPORT]
  );
  console.log(`[move] seeded league=${seed.leagueId} team=${seed.team} tag=${TAG}`);
});

test.afterAll(async () => {
  if (!seed.leagueId) return;
  // Reverse order of the seed; movement rows and new entries cascade from the team.
  await stagingSql(`delete from games where league_id = $1`, [seed.leagueId]);
  await stagingSql(`delete from teams where id = any($1::uuid[])`, [[seed.team, seed.rival]]);
  if (seed.persons.length) await stagingSql(`delete from persons where id = any($1::uuid[])`, [seed.persons]);
  await stagingSql(`delete from leagues where id = $1`, [seed.leagueId]);
});

test("rule A: rollover clones the team into the next season and copies the roster", async ({ browser }) => {
  test.setTimeout(180_000);
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApiErrors(page);
  await page.goto(`${E2E_URLS.superadmin}/teams/${seed.team}`);
  await expect(page.getByText(/Seasons & divisions/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("cell", { name: `${TAG} Season 2026` })).toBeVisible();

  await page.getByRole("button", { name: "Move team" }).click();
  await page.getByLabel("What do you want to do", { exact: true }).selectOption("rollover");
  await page.getByLabel("Season", { exact: true }).selectOption({ label: `${TAG} Season 2027 (draft, starts 2027-10-01)` });
  await page.getByLabel("Division", { exact: true }).selectOption({ label: `${TAG} A 2027` });
  await expect(page.getByLabel("Copy the current active roster into the new season")).toBeChecked();
  await page.getByLabel("Reason (optional)").fill("e2e rollover");
  await page.getByRole("button", { name: "Roll over to a new season" }).click();

  await expect(page.getByText(/Rolled over · now in .* Season 2027/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Dues are not copied/)).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`${TAG} Season 2027`) });
  await expect(row).toContainText("applied");
  await expect(row).toContainText("Rolled over from");

  // Durable record and downstream effect.
  const [e] = await stagingSql<{ id: string; previous_entry_id: string; movement_kind: string; entry_status: string }>(
    `select id, previous_entry_id, movement_kind, entry_status from division_team_entries where team_id = $1 and division_id = $2`,
    [seed.team, seed.s2a]
  );
  expect(e?.previous_entry_id).toBe(seed.entry);
  expect(e?.movement_kind).toBe("rollover");
  expect(e?.entry_status).toBe("applied");
  const [roster] = await stagingSql<{ n: number }>(
    `select count(*)::int n from team_memberships where team_id = $1 and season_id = $2 and current_status = 'active'`,
    [seed.team, seed.s2]
  );
  expect(roster?.n).toBe(seed.memberships);
  const [old] = await stagingSql<{ n: number }>(
    `select count(*)::int n from team_memberships where team_id = $1 and season_id = $2 and current_status = 'active'`,
    [seed.team, seed.s1]
  );
  expect(old?.n).toBe(seed.memberships); // old season untouched
  const [m] = await stagingSql<{ kind: string; roster_copied: number; reason: string }>(
    `select kind, roster_copied, reason from team_movements where team_id = $1 order by created_at desc limit 1`,
    [seed.team]
  );
  expect(m).toMatchObject({ kind: "rollover", roster_copied: seed.memberships, reason: "e2e rollover" });
  console.log(`[move] rollover ok: new entry ${e!.id}, roster copied ${roster!.n}`);
  await context.close();
});

test("rule A unhappy path: a second rollover into the same division is refused", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page, context } = await signedInAs(browser, "superAdmin");
  await page.goto(`${E2E_URLS.superadmin}/teams/${seed.team}`);
  await page.getByRole("button", { name: "Move team" }).click();
  await page.getByLabel("What do you want to do", { exact: true }).selectOption("rollover");
  await page.getByLabel("Season", { exact: true }).selectOption({ label: `${TAG} Season 2027 (draft, starts 2027-10-01)` });
  await page.getByLabel("Division", { exact: true }).selectOption({ label: `${TAG} A 2027` });
  await page.getByRole("button", { name: "Roll over to a new season" }).click();
  await expect(page.getByText(/already has a live entry|not after|needs a different season/)).toBeVisible({ timeout: 20_000 });
  const [n] = await stagingSql<{ n: number }>(
    `select count(*)::int n from division_team_entries where team_id = $1 and division_id = $2`,
    [seed.team, seed.s2a]
  );
  expect(n?.n).toBe(1);
  await context.close();
});

test("rule B: mid-season division shift closes the old instance and resets standings", async ({ browser }) => {
  test.setTimeout(180_000);
  const { page, context } = await signedInAs(browser, "superAdmin");
  logApiErrors(page);
  await page.goto(`${E2E_URLS.superadmin}/teams/${seed.team}`);
  await page.getByRole("button", { name: "Move team" }).click();
  await page.getByLabel("What do you want to do", { exact: true }).selectOption("division_shift");
  await page.getByLabel("Which season instance", { exact: true }).selectOption({ label: `${TAG} Season 2026 · ${TAG} A 2026 (confirmed)` });
  await page.getByLabel("Division", { exact: true }).selectOption({ label: `${TAG} B 2026` });
  await page.getByLabel("Standings", { exact: true }).selectOption("reset");
  await page.getByRole("button", { name: "Change division (same season)" }).click();

  await expect(page.getByText(/Division changed · now in .* B 2026/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Standings restart at 0-0-0/)).toBeVisible();
  const oldRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: `${TAG} A 2026`, exact: true }) });
  await expect(oldRow).toContainText("moved");
  const newRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: `${TAG} B 2026`, exact: true }) });
  await expect(newRow).toContainText("confirmed");

  const [src] = await stagingSql<{ entry_status: string; left_at: string | null }>(
    `select entry_status, left_at from division_team_entries where id = $1`,
    [seed.entry]
  );
  expect(src?.entry_status).toBe("moved");
  expect(src?.left_at).not.toBeNull();
  const [dst] = await stagingSql<{ entry_status: string; carry_standings: boolean; previous_entry_id: string }>(
    `select entry_status, carry_standings, previous_entry_id from division_team_entries where team_id = $1 and division_id = $2`,
    [seed.team, seed.s1b]
  );
  expect(dst).toMatchObject({ entry_status: "confirmed", carry_standings: false, previous_entry_id: seed.entry });
  // The played game stays on record in A; B starts at zero.
  const standings = await stagingSql<{ division_id: string; gp: number; w: number }>(
    `select division_id, gp, w from standings where league_id = $1 and team_id = $2 order by division_id`,
    [seed.leagueId, seed.team]
  );
  const a = standings.find((s) => s.division_id === seed.s1a);
  const b = standings.find((s) => s.division_id === seed.s1b);
  expect(a).toMatchObject({ gp: 1, w: 1 });
  expect(b === undefined || b.gp === 0).toBe(true);
  const [game] = await stagingSql<{ division_id: string }>(
    `select division_id from games where league_id = $1 and home_team_id = $2`,
    [seed.leagueId, seed.team]
  );
  expect(game?.division_id).toBe(seed.s1a);
  console.log(`[move] shift ok: standings A=${JSON.stringify(a)} B=${JSON.stringify(b)}`);

  // Destination: the division page lists the team.
  await page.goto(`${E2E_URLS.superadmin}/divisions/${seed.s1b}`);
  await expect(page.getByText(`${TAG} Movers`).first()).toBeVisible({ timeout: 20_000 });
  await context.close();
});
