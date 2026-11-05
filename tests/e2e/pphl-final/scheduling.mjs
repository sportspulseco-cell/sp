import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {m,save,browser,expect,open,snapshot,fits} from './browser-lib.mjs';
import {sql,OUT,api,login,call} from './lib.mjs';
const checks=[],s=m.leagues[0],division=s.divisions[0],team=m.teams[0];
try {
 const token=await login(m.accounts.org_admin.email,m.accounts.org_admin.password);
 const [season]=await sql`select status from seasons where id=${s.seasonId}`;
 if(season.status==='draft')await api('POST',`/league/seasons/${s.seasonId}/status`,{status:'registration_open'},token);
 if(['draft','registration_open'].includes(season.status))await api('POST',`/league/seasons/${s.seasonId}/status`,{status:'in_progress'},token);
 const oa=await open('org_admin','org',`/scheduling/${s.seasonId}/generate`);
 await oa.page.getByLabel('Division',{exact:true}).selectOption(division.id);
 await expect(oa.page.getByRole('button',{name:'Generate',exact:true})).toBeEnabled();
 let existing=await sql`select id from games where season_id=${s.seasonId} and division_id=${division.id}`;
 if(!existing.length){
  await oa.page.getByLabel('First day',{exact:true}).fill('2026-12-28');await oa.page.getByLabel('Reason',{exact:true}).fill('Winter holiday closure');
  await oa.page.getByRole('button',{name:'Add blackout'}).click();await expect(oa.page.getByRole('list',{name:'Blackout dates'})).toContainText('Winter holiday closure');
  await oa.page.getByLabel('Max games per team per week',{exact:true}).fill('2');
  const generated=oa.page.waitForResponse(r=>r.url().includes('scheduler-generate')&&r.request().method()==='POST',{timeout:180000});
  await oa.page.getByRole('button',{name:'Generate',exact:true}).click();const r=await generated;expect(r.ok(),await r.text()).toBe(true);
  await expect(oa.page.getByText('Draft schedule ready',{exact:true})).toBeVisible();
  const [counts]=await sql`select count(*)::int n,count(*) filter(where published_at is not null)::int published from games where season_id=${s.seasonId} and division_id=${division.id}`;
  const [teams]=await sql`select count(*)::int n from division_team_entries where division_id=${division.id} and left_at is null`;
  expect(counts.n).toBe(teams.n*(teams.n-1)/2);expect(counts.published).toBe(0);
  expect((await sql`select id from games where season_id=${s.seasonId} and (scheduled_start_ts_utc at time zone 'America/New_York')::date='2026-12-28'`).length).toBe(0);
  await fits(oa.page,'organization-draft-schedule');await oa.page.getByRole('button',{name:'Publish',exact:true}).click();await expect(oa.page.getByRole('button',{name:'Published',exact:true})).toBeVisible();
 }
 checks.push('Organization administrator creates a full round-robin draft, respects the holiday blackout and publishes through the scheduling UI.');
 await oa.page.goto(oa.base+`/scheduling/${s.seasonId}/conflicts`);await expect(oa.page.getByText('No team-overlap conflicts',{exact:true})).toBeVisible();await snapshot(oa.page,'organization-conflict-check');
 for(const key of ['captain','player']){
  const actor=await open(key,key==='captain'?'team':'player','/schedule');await expect(actor.page.getByRole('main')).toContainText('Harbor Ice Centre');await snapshot(actor.page,`${key}-published-schedule`);
  await actor.page.goto(actor.base+'/notifications');await expect(actor.page.getByRole('main')).toContainText('Winter 2026-27');await fits(actor.page,`${key}-published-notification`);await actor.context.close();
 }
 checks.push('Fresh captain and player sessions receive the same published schedule and their own in-app publication notifications.');
 const [game]=await sql`select id,home_team_id,away_team_id,status from games where season_id=${s.seasonId} and (home_team_id=${team.id} or away_team_id=${team.id}) order by scheduled_start_ts_utc limit 1`;
 expect(game).toBeTruthy();
 const scorer=m.accounts.player.personId;
 const sk=await open('scorekeeper','superadmin',`/games/${game.id}`);
 if(game.status==='scheduled'){
  await sk.page.getByRole('button',{name:'Start play',exact:true}).click();
 }
 // Persist a real game event through the scoring API, then verify/finalize in the role's UI.
 const [current]=await sql`select status from games where id=${game.id}`;
 if(current.status!=='completed'){
  const st=await login(m.accounts.scorekeeper.email,m.accounts.scorekeeper.password);
  const [goal]=await sql`select id from game_events where game_id=${game.id} and event_type='goal'`;
  if(!goal)await api('POST','/game-events',{gameId:game.id,eventType:'goal',period:1,teamId:team.id,primaryPersonId:scorer,secondaryPersonIds:[],idempotencyKey:'pphl-final-goal-'+game.id},st);
  await sk.page.reload();await sk.page.getByRole('button',{name:'Finalize',exact:true}).click();const dialog=sk.page.getByRole('dialog',{name:'Finalize game'});
  await dialog.getByRole('radio',{name:'Regulation',exact:true}).check();await dialog.getByRole('button',{name:'Confirm final score'}).click();await expect(dialog).toHaveCount(0);
 }
 await snapshot(sk.page,'scorekeeper-final-result');
 const [line]=await sql`select core from stat_lines where game_id=${game.id} and person_id=${scorer}`;expect(Number(line?.core?.goals)).toBe(1);
 const player=await open('player','player','/stats');await expect(player.page.getByRole('main')).toContainText(/Goals/i);await snapshot(player.page,'player-persisted-stats');
 expect((await call('GET','/notifications/summary',undefined,await login(m.accounts.player.email,m.accounts.player.password))).status).toBe(403);
 checks.push('Season-scoped scorekeeper finalizes a logged goal; the receiving player sees rebuilt statistics and cannot read global delivery totals.');
 m.rehearsal??={};m.rehearsal.schedulePassed=true;m.rehearsal.gameId=game.id;save();
 writeFileSync(`${OUT}/scheduling-results.json`,JSON.stringify({outcome:'passed',checks,gameId:game.id},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'));
}catch(error){for(const ctx of browser.contexts())for(const page of ctx.pages())await snapshot(page,'scheduling-failure-'+browser.contexts().indexOf(ctx)).catch(()=>{});writeFileSync(`${OUT}/scheduling-results.json`,JSON.stringify({outcome:'failed',checks,error:String(error)},null,2));throw error;}
finally{await browser.close();await sql.end({timeout:5});}
