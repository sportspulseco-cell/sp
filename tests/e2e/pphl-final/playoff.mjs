import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {m,save,browser,expect,open,snapshot} from './browser-lib.mjs';
import {sql,OUT,login,call} from './lib.mjs';
const checks=[],gameId=m.rehearsal?.playoffGameId??randomUUID(),team=m.teams[0],scorer=m.accounts.player.personId,assist=m.accounts.captain.personId;
try{
 if(!(await sql`select id from games where id=${gameId}`).length){
  const [source]=await sql`select id from games where season_id=${m.leagues[0].seasonId} and (home_team_id=${team.id} or away_team_id=${team.id}) limit 1`;expect(source).toBeTruthy();
  await sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g)||jsonb_build_object('id',${gameId}::text,'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual','status','in_play','locked_at',null,'published_at',now(),'finalized_at',null,'game_type','playoff','home_score',0,'away_score',0,'period',4,'scheduled_start_ts_utc','2027-03-08T23:00:00Z','metadata','{}'::jsonb))).* from games g where g.id=${source.id}`;
  m.rehearsal??={};m.rehearsal.playoffGameId=gameId;save();
 }
 const sk=await open('scorekeeper','superadmin',`/games/${gameId}`),page=sk.page;
 const [game]=await sql`select status from games where id=${gameId}`;
 if(game.status!=='completed'){
  await page.getByRole('button',{name:'Finalize',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Finalize game'});
  await expect(dialog.getByText(/Playoff rule: Sudden death/)).toBeVisible();await expect(dialog.getByRole('button',{name:'Confirm final score'})).toBeDisabled();await expect(dialog.getByRole('radio',{name:'Shootout',exact:true})).toHaveCount(0);
  expect((await call('POST',`/games/${gameId}/finalize`,{endedIn:'regulation'},await login(m.accounts.scorekeeper.email,m.accounts.scorekeeper.password))).status).toBe(422);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Log event',exact:true}).click();dialog=page.getByRole('dialog',{name:'Log game event'});
  await dialog.getByLabel('Event type',{exact:true}).selectOption('goal');await dialog.getByLabel('Team',{exact:true}).selectOption(team.id);await dialog.getByLabel('Player',{exact:true}).selectOption(scorer);await dialog.getByLabel('Assist 1',{exact:true}).selectOption(assist);await dialog.getByLabel('Period',{exact:true}).fill('4');
  const logged=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/game-events'));await dialog.getByRole('button',{name:'Log event',exact:true}).click();expect((await logged).ok()).toBe(true);await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Finalize',exact:true}).click();dialog=page.getByRole('dialog',{name:'Finalize game'});await dialog.getByRole('radio',{name:'Overtime',exact:true}).check();await dialog.getByRole('button',{name:'Confirm final score'}).click();await expect(dialog).toHaveCount(0);
 }
 const lines=await sql`select person_id,core from stat_lines where game_id=${gameId}`;expect(Number(lines.find(p=>p.person_id===scorer)?.core?.goals)).toBe(1);expect(Number(lines.find(p=>p.person_id===assist)?.core?.assists)).toBe(1);
 const [result]=await sql`select status,metadata->>'endedIn' ended_in from games where id=${gameId}`;expect(result.status).toBe('completed');expect(result.ended_in).toBe('overtime');
 await snapshot(page,'playoff-goal-assist-finalized');checks.push('The independent sudden-death playoff rule blocks a tied final in the dialog and API.','Scorekeeper logs a goal and assist through the actual event dialog and finalizes overtime. Each persisted stat counts once.');
 const player=await open('player','player','/stats');await expect(player.page.getByRole('main')).toContainText(/Goals/i);await snapshot(player.page,'player-after-playoff-result');
 writeFileSync(OUT+'/playoff-results.json',JSON.stringify({outcome:'passed',checks,gameId},null,2));console.log('PASS playoff winner guard, goal/assist UI and final statistics');
}catch(error){for(const c of browser.contexts())for(const p of c.pages())await snapshot(p,'playoff-failure').catch(()=>{});writeFileSync(OUT+'/playoff-results.json',JSON.stringify({outcome:'failed',checks,error:String(error)},null,2));throw error;}
finally{await browser.close();await sql.end({timeout:5});}
