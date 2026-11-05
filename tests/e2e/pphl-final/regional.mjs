import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {m,save,browser,expect,open,snapshot,fits} from './browser-lib.mjs';
import {sql,OUT,login,call} from './lib.mjs';
const checks=[],volunteer=m.accounts.regional_player,note='North Metro goalie cover',team=m.teams[0];
try{
 const [game]=await sql`select id from games where season_id=${m.leagues[0].seasonId} and status='scheduled' and (home_team_id=${team.id} or away_team_id=${team.id}) order by scheduled_start_ts_utc limit 1`;expect(game).toBeTruthy();
 // Explicit fictional membership fixture, not a claim of registry verification.
 if(!(await sql`select id from identity_verifications where person_id=${volunteer.personId} and status='verified'`).length)await sql`insert into identity_verifications(person_id,governing_body_id,external_id,status,source,verified_at,expires_at) select ${volunteer.personId},id,'TEST-PPHL-MAYA','verified','document_upload',now(),'2028-01-01' from governing_bodies where code='USA_HOCKEY'`;
 const p=await open('regional_player','player','/');const preferences=p.page.locator('section[aria-labelledby="regional-player-title"]');await preferences.locator('summary').click();await preferences.getByLabel('Region',{exact:true}).selectOption(m.regions.north);await preferences.getByRole('checkbox',{name:/Send me approved/}).check();await preferences.getByRole('checkbox',{name:'Goalie',exact:true}).check();await preferences.getByRole('button',{name:'Save preferences'}).click();await expect(preferences.getByText('Your regional preferences are saved.')).toBeVisible();
 const captain=await open('captain','team',`/schedule/${game.id}/subs`),panel=captain.page.locator('section[aria-labelledby="regional-request-title"]');
 let [request]=await sql`select id,status from substitute_broadcasts where game_id=${game.id} and team_id=${team.id} order by created_at desc limit 1`;
 if(!request){await panel.getByRole('button',{name:'Ask staff to find a sub'}).click();await panel.getByLabel('Note for the invitation').fill(note);await panel.getByRole('button',{name:'Submit for staff review'}).click();await expect(panel.getByText('Waiting for staff review')).toBeVisible();[request]=await sql`select id,status from substitute_broadcasts where game_id=${game.id} order by created_at desc limit 1`;}
 const capToken=await login(m.accounts.captain.email,m.accounts.captain.password);
 if(request.status==='pending_review'){
  expect((await sql`select id from substitute_broadcast_recipients where broadcast_id=${request.id}`).length).toBe(0);
  expect([403,404]).toContain((await call('POST',`/admin/regional-subs/requests/${request.id}/review`,{action:'approve'},capToken)).status);
  const oa=await open('org_admin','org','/substitutes'),card=oa.page.locator('section').filter({hasText:note});await snapshot(oa.page,'regional-staff-review');await card.getByRole('button',{name:'Approve and send invitations'}).click();await expect(oa.page.getByText(note)).toHaveCount(0);await oa.context.close();
 }
 checks.push('An opted-in player belongs to another league in the same region. The captain request creates no invitation before staff approval and cannot self-approve.');
 await p.page.reload();const offer=p.page.locator('section[aria-labelledby="regional-player-title"] article').filter({hasText:note});await expect(offer).toBeVisible();const accept=offer.getByRole('button',{name:'I can play'});if(await accept.isVisible())await accept.click();await expect(offer.getByText("You're confirmed",{exact:true})).toBeVisible();
 expect((await sql`select id from game_attendance where game_id=${game.id} and person_id=${volunteer.personId} and is_guest=true`).length).toBe(1);
 await p.page.goto(p.base+'/schedule');await expect(p.page.getByRole('heading',{name:'Confirmed substitute games',exact:true})).toBeVisible();await fits(p.page,'regional-player-confirmed-schedule');
 await captain.page.reload();await expect(panel.getByText('Substitute confirmed',{exact:true})).toBeVisible();await expect(panel.getByText(/On your guest lineup:/)).toContainText(volunteer.name);await snapshot(captain.page,'regional-captain-confirmation');
 const raw=await call('GET',`/captain/regional-subs/${team.id}/games/${game.id}`,undefined,capToken);expect(raw.status).toBe(200);for(const field of ['email','dob','availability','externalId'])expect(JSON.stringify(raw.json).includes('"'+field+'"')).toBe(false);
 expect([403,404]).toContain((await call('GET','/admin/regional-subs/pending',undefined,await login(volunteer.email,volunteer.password))).status);
 checks.push('Maya accepts from a separate league, appears exactly once as a guest and sees the confirmed game. The captain receives no private contacts or membership identifiers; the player cannot read the approval queue.');
 m.rehearsal??={};m.rehearsal.regionalPassed=true;m.rehearsal.substituteGameId=game.id;save();writeFileSync(OUT+'/regional-results.json',JSON.stringify({outcome:'passed',checks,gameId:game.id,membership:'Explicit fictional verified-proof fixture; no USA Hockey API used',fees:'disabled'},null,2));console.log('PASS connected regional substitute workflow');
}catch(error){for(const c of browser.contexts())for(const p of c.pages())await snapshot(p,'regional-failure-'+browser.contexts().indexOf(c)).catch(()=>{});writeFileSync(OUT+'/regional-results.json',JSON.stringify({outcome:'failed',checks,error:String(error)},null,2));throw error;}
finally{await browser.close();await sql.end({timeout:5});}
