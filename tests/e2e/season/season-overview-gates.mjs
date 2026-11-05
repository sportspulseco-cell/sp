import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { CFG, OUT, TARGET, call, login, sql } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Season overview gates are staging-only");
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const checks = [], timingsMs = [];
try {
  const admin = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  for (let i = 0; i < 5; i++) {
    const before = performance.now(), result = await call("GET", `/league/seasons/${ids.seasonId}/overview`, undefined, admin);
    timingsMs.push(Math.round(performance.now() - before));
    assert.equal(result.status, 200); assert.equal(result.json.divisions, 3); assert.equal(result.json.placedTeams, 12);
    assert.equal(result.json.pendingTeamApplications, 0); assert.equal(result.json.players, 60);
    assert.equal(result.json.games, 36); assert.equal(result.json.finalGames, 6);
    assert.ok(Buffer.byteLength(JSON.stringify(result.json)) < 800);
    assert.deepEqual(Object.keys(result.json).sort(), ["seasonId", "divisions", "registrations", "waitingRegistrations",
      "pendingTeamApplications", "placedTeams", "players", "games", "finalGames", "publishedForm", "nextGame"].sort());
  }
  checks.push("Scoped organization staff receives correct connected-season counts in a bounded response, without participant records.");
  const pw = `Play!${ids.tag}x9`, player = ids.players["Team Alpha"].find(p => p.rostered);
  for (const [role, email] of [["player", player.email], ["captain", ids.captains["Team Alpha"].email]]) {
    const token = await login(email, pw), result = await call("GET", `/league/seasons/${ids.seasonId}/overview`, undefined, token);
    assert.ok([403, 404].includes(result.status), `${role} must not receive staff aggregates`);
  }
  const [foreign] = await sql`select id from seasons where org_id<>${ids.orgId}::uuid and deleted_at is null limit 1`;
  assert.ok(foreign); assert.equal((await call("GET", `/league/seasons/${foreign.id}/overview`, undefined, admin)).status, 404);
  checks.push("Player and captain roles are denied; an organization admin cannot read another organization's counts.");
  console.log(checks.map(c => `PASS ${c}`).join("\n"));
  console.log(`Observed five staging reads (ms): ${timingsMs.join(", ")}; capacity/SLO certification remains outstanding.`);
  writeFileSync(`${OUT}/season-overview-gates.json`, JSON.stringify({ passed: true, checks, timingsMs }, null, 2));
} finally { await sql.end(); }
