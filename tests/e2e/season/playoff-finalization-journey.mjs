import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { CFG, OUT, TARGET, SUPABASE_IP, call, login, sql } from "./lib.mjs";
if (TARGET !== "staging") throw new Error("Playoff browser rehearsal is staging-only");
const { ids } = JSON.parse(readFileSync(`${OUT}/latest.json`, "utf8"));
const gameId=randomUUID(), leagueId=randomUUID(), seasonId=randomUUID(), divisionId=randomUUID(), tag=randomUUID().slice(0,8), checks=[];
let fixtures=false;
const browser=await chromium.launch({args:[`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`]});
try {
  const [source]=await sql`select * from games where season_id=${ids.seasonId} limit 1`; assert.ok(source?.division_id);
  const [scorer]=await sql`select person_id from team_memberships where team_id=${source.home_team_id} and season_id=${ids.seasonId} and current_status='active' limit 1`; assert.ok(scorer);
  await sql.begin(async tx=>{
    await tx`insert into leagues select (jsonb_populate_record(null::leagues,to_jsonb(l)||jsonb_build_object('id',${leagueId}::text,'name',${`QA Playoff Hockey ${tag}`}::text))).* from leagues l where id=${source.league_id}`;
    await tx`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s)||jsonb_build_object('id',${seasonId}::text,'league_id',${leagueId}::text,'name',${`QA Playoff Season ${tag}`}::text,'metadata','{}'::jsonb))).* from seasons s where id=${ids.seasonId}`;
    await tx`insert into divisions select (jsonb_populate_record(null::divisions,to_jsonb(d)||jsonb_build_object('id',${divisionId}::text,'season_id',${seasonId}::text,
      'rule_set_overrides',jsonb_set(d.rule_set_overrides,'{gameRules}',coalesce(d.rule_set_overrides->'gameRules','{}'::jsonb)||'{"overtimeRule":"none"}'::jsonb),
      'playoff_config',d.playoff_config||'{"overtimeRule":"sudden_death"}'::jsonb))).* from divisions d where id=${source.division_id}`;
    await tx`insert into division_team_entries select (jsonb_populate_record(null::division_team_entries,to_jsonb(e)||jsonb_build_object('id',gen_random_uuid()::text,'division_id',${divisionId}::text,'invoice_id',null))).* from division_team_entries e where e.division_id=${source.division_id} and e.team_id in (${source.home_team_id},${source.away_team_id}) and e.left_at is null`;
    await tx`insert into games select (jsonb_populate_record(null::games,to_jsonb(g)||jsonb_build_object('id',${gameId}::text,'league_id',${leagueId}::text,'season_id',${seasonId}::text,'division_id',${divisionId}::text,
      'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual','status','in_play','locked_at',null,'published_at',now(),'finalized_at',null,
      'game_type','playoff','home_score',0,'away_score',0,'period',4,'scheduled_start_ts_utc','2026-11-20T20:00:00Z','tz','UTC','metadata','{}'::jsonb))).* from games g where id=${source.id}`;
    await tx`insert into game_attendance(game_id,team_id,person_id,status,is_guest) values(${gameId},${source.home_team_id},${scorer.person_id},'present',false)`;
  });fixtures=true;
  const token=await login(CFG.superAdmin.email,CFG.superAdmin.password);
  const context=await browser.newContext({viewport:{width:1440,height:1100}}), page=await context.newPage();page.setDefaultTimeout(90000);
  const base="https://staging-superadmin.sportspulse.us",url=new URL('/sign-in',base);
  url.searchParams.set('x-vercel-protection-bypass',CFG.bypass('superadmin'));url.searchParams.set('x-vercel-set-bypass-cookie','true');
  await page.goto(url.toString());await page.locator('input[type=email]').fill(CFG.superAdmin.email);await page.locator('input[type=password]').fill(CFG.superAdmin.password);
  await page.locator('button[type=submit]').click();await page.waitForURL(url=>!url.pathname.startsWith('/sign-in'));
  await page.goto(`${base}/games/${gameId}`);await page.getByRole('button',{name:'Finalize',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Finalize game'});
  await expect(dialog.getByText(/Playoff rule: Sudden death/)).toBeVisible();
  await expect(dialog.getByText(/A playoff game needs a winner/)).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Confirm final score'})).toBeDisabled();
  await expect(dialog.getByRole('radio',{name:'Shootout',exact:true})).toHaveCount(0);
  const tied = await call('POST',`/games/${gameId}/finalize`,{endedIn:'regulation'},token);
  assert.equal(tied.status,422); assert.match(JSON.stringify(tied.json),/needs a winner/);
  checks.push('The playoff sudden-death override is displayed despite regular no-OT rules; a tied final is disabled in the dialog and refused by the API.');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  const goal=await call('POST','/game-events',{gameId,eventType:'goal',period:4,teamId:source.home_team_id,primaryPersonId:scorer.person_id,secondaryPersonIds:[],idempotencyKey:`qa-playoff-${tag}`},token);
  assert.ok(goal.status<300,JSON.stringify(goal.json));
  const bad=await call('POST',`/games/${gameId}/finalize`,{endedIn:'shootout'},token);assert.equal(bad.status,422);assert.match(JSON.stringify(bad.json),/do not allow a shootout/);
  await page.reload();await page.getByRole('button',{name:'Finalize',exact:true}).click();dialog=page.getByRole('dialog',{name:'Finalize game'});
  await dialog.getByRole('radio',{name:'Overtime',exact:true}).check();
  await expect(dialog.getByRole('button',{name:'Confirm final score'})).toBeEnabled();
  const final=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/games/${gameId}/finalize`&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Confirm final score'}).click();assert.ok((await final).ok());
  await expect(dialog).toHaveCount(0);
  const [saved]=await sql`select status,home_score,away_score,metadata->>'endedIn' ended_in from games where id=${gameId}`;
  assert.equal(saved.status,'completed');assert.equal(saved.home_score,1);assert.equal(saved.away_score,0);assert.equal(saved.ended_in,'overtime');
  checks.push('A logged overtime goal updates the score, unsupported shootout is refused, and staff finalizes the 1–0 playoff through the dialog.');
  await page.screenshot({path:`${OUT}/playoff-finalized.png`,fullPage:true});
  writeFileSync(`${OUT}/playoff-finalization-browser.json`,JSON.stringify({tag,checks,passed:checks.length,outcome:'passed'},null,2));console.log(JSON.stringify({passed:checks.length,checks}));
}catch(error){writeFileSync(`${OUT}/playoff-finalization-browser.json`,JSON.stringify({tag,checks,outcome:'failed',error:String(error)},null,2));throw error;}
finally{
  await browser.close();if(fixtures)await sql.begin(async tx=>{
    await tx`delete from notifications where payload->>'gameId'=${gameId}`;
    await tx`delete from games where id=${gameId}`;
    await tx`delete from division_team_entries where division_id=${divisionId}`;
    await tx`delete from divisions where id=${divisionId}`;await tx`delete from seasons where id=${seasonId}`;await tx`delete from leagues where id=${leagueId}`;
  });await sql.end({timeout:5});
}
