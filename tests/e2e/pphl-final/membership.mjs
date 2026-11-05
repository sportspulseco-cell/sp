import {writeFileSync} from 'node:fs';
import {m,save,browser,expect,snapshot} from './browser-lib.mjs';
import {sql,OUT,CFG,login,api,entryUrl} from './lib.mjs';
const checks=[],actor=m.accounts.player;
try{
 if(!m.rehearsal.membershipTeamId){const root=await login(CFG.superAdmin.email,CFG.superAdmin.password);const team=await api('POST','/league/teams',{orgId:m.orgId,name:'Harbor Spring Rookies',sportCode:'HOCKEY_ICE',confirmationThresholdCents:0},root);const [division]=await sql`select id from divisions where season_id=${m.guidedSetup.seasonId} order by name limit 1`;await sql`insert into division_team_entries(division_id,team_id,entry_status) values(${division.id},${team.id},'confirmed')`;m.rehearsal.membershipTeamId=team.id;save();}
 for(const [required,seasonId,teamId] of [[false,m.leagues[1].seasonId,m.teams.find(t=>t.seasonId===m.leagues[1].seasonId).id],[true,m.guidedSetup.seasonId,m.rehearsal.membershipTeamId]]){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(entryUrl('player',`/register/${seasonId}?team=${teamId}`));
  const path=page.getByRole('button',{name:/Register as a player/});await expect(path).toBeVisible();await path.click();await page.getByRole('button',{name:/^Next/}).click();await page.getByRole('tab',{name:/^Sign in$/i}).click();await page.getByLabel(/^Email/).fill(actor.email);await page.getByLabel(/^Password/).fill(actor.password);await page.getByRole('button',{name:/Sign in & continue/}).click();
  const id=page.getByLabel(/^USA Hockey ID/);await expect(id).toBeVisible();await page.getByLabel(/^Skill level/).selectOption('B');for(const label of ['Center','Mon']){const b=page.getByRole('button',{name:label,exact:true});if(!(await b.getAttribute('class')).includes('bg-accent/10'))await b.click();}
  await id.fill('');const next=page.getByRole('button',{name:/Next: Waivers/});
  if(required){await expect(next).toBeDisabled();expect(await id.getAttribute('required')).not.toBeNull();await id.fill('2026110502');await expect(next).toBeEnabled();}
  else {await expect(next).toBeEnabled();await expect(page.getByText('USA Hockey ID (optional)',{exact:true})).toBeVisible();await id.fill('!');await expect(next).toBeDisabled();await id.fill('');await expect(next).toBeEnabled();}
  await snapshot(page,`membership-${required?'required':'optional'}`);await next.click();await expect(page.getByText('Sign to continue',{exact:true})).toBeVisible();
  if(required){await page.getByText('Eligibility checks',{exact:false}).first().click();await expect(page.getByText(/League staff review your membership proof/)).toBeVisible();}
  await context.close();checks.push(required?'Required season blocks blank membership ID, accepts a valid format and explains that staff must review proof.':'Optional season accepts blank ID, refuses a malformed entered value and allows progression without membership data.');
 }
 writeFileSync(OUT+'/membership-results.json',JSON.stringify({outcome:'passed',checks,fixture:'Two unsubmitted registration drafts; no real membership verified'},null,2));console.log('PASS optional/required membership setting and honest staff-review copy');
}catch(error){for(const c of browser.contexts())for(const p of c.pages())await snapshot(p,'membership-failure').catch(()=>{});writeFileSync(OUT+'/membership-results.json',JSON.stringify({outcome:'failed',checks,error:String(error)},null,2));throw error;}
finally{await browser.close();await sql.end({timeout:5});}
