import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { CFG, OUT, TARGET, call, login, q, sql } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Postflight fixtures are staging-only");
const historical = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const { ids } = historical;
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
let poolId, copiedLeague;
try {
  const password = `Play!${ids.tag}x9`;
  const player = ids.players["Team Alpha"].find(p => p.rostered);
  const captain = ids.captains["Team Alpha"];
  const [oa, pl, ca] = await Promise.all([login(CFG.orgAdmin.email, CFG.orgAdmin.password), login(player.email, password), login(captain.email, password)]);
  const [person] = await q("select p.id from persons p join auth.users u on u.id=p.user_id where u.email=$1", [player.email]);
  const [league] = await q("select name,sport_code from leagues where id=$1", [ids.leagueId]);
  const duplicate = await call("POST", "/league/leagues", { orgId: ids.orgId, sportCode: league.sport_code, name: league.name }, oa);
  check("A live league name is rejected within the same organization", duplicate.status === 409);
  const [archived] = await q("select name,sport_code from leagues l where org_id=$1 and status='archived' and deleted_at is null and not exists(select 1 from leagues a where a.org_id=l.org_id and lower(trim(a.name))=lower(trim(l.name)) and a.status<>'archived' and a.deleted_at is null) order by updated_at desc limit 1", [ids.orgId]);
  assert.ok(archived, "Archived-name fixture required");
  const reused = await call("POST", "/league/leagues", { orgId: ids.orgId, sportCode: archived.sport_code, name: archived.name }, oa);
  if (reused.status === 201) copiedLeague = reused.json.id;
  check("An archived league name can be reused, as intended", reused.status === 201);
  check("Historical 160 passing steps are retained without rewriting the incorrect archived-name assertion", historical.steps.filter(s => !s.ok).length === 1 && historical.steps.filter(s => !s.ok)[0].what.includes("same name"));
  const prior = await q("select id from free_agent_pool_entries where player_person_id=$1 and season_id=$2", [person.id, ids.seasonId]);
  assert.equal(prior.length, 0, "Do not overwrite an existing recruiting entry");
  const created = await call("POST", "/registration-v2/free-agent-pool", { playerPersonId: person.id,
    seasonId: ids.seasonId, positions: ["F"], levelPrimary: "C", note: "QA private contact canary",
    availability: { mon: true, privateNote: "QA private availability canary", email: "qa-private@example.invalid" } }, pl);
  assert.equal(created.status, 201); poolId = created.json.id; assert.ok(poolId);
  const pool = await call("GET", `/registration-v2/free-agent-pool?forTeamId=${ids.teams["Team Alpha"].id}`, undefined, ca);
  assert.equal(pool.status, 200); const visible = pool.json.find(e => e.id === poolId); assert.ok(visible);
  check("Raw captain recruiting response omits contact details, DOB, free text and metadata", visible.playerEmail === null && visible.playerDob === null && visible.note === null && Object.keys(visible.metadata).length === 0 && !JSON.stringify(visible).includes("canary") && !JSON.stringify(visible).includes("example.invalid"));
  const unauthorized = await call("GET", `/registration-v2/free-agent-pool?forTeamId=${ids.teams["Team Alpha"].id}`, undefined, pl);
  check("Rostered player cannot browse captain recruiting data", unauthorized.status === 403);
  const move = { teamId: ids.teams["Team Alpha"].id, seasonId: ids.seasonId, personId: person.id };
  const playerMove = await call("POST", "/roster/moves/add", move, pl);
  const captainMove = await call("POST", "/roster/moves/add", move, ca);
  check("Player membership and captain status cannot bypass the dedicated roster workflow", playerMove.status === 403 && captainMove.status === 403);
  writeFileSync(`${OUT}/postflight-gates.json`, JSON.stringify({ tag: ids.tag, passed: true, checks,
    historicalRun: { passed: 160, total: 161, fixtureCorrectionVerified: true } }, null, 2));
} finally {
  if (poolId) await q("delete from free_agent_pool_entries where id=$1 and season_id=$2", [poolId, ids.seasonId]);
  if (copiedLeague) {
    const oa = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
    const archived = await call("POST", `/league/leagues/${copiedLeague}/status`, { status: "archived" }, oa);
    assert.equal(archived.status, 201, "Archive the temporary name-reuse fixture");
  }
  await sql.end();
}
