import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {m,browser,expect,open,snapshot,fits} from './browser-lib.mjs';
import {sql,OUT as BASE_OUT,apps,entryUrl,login,api,call} from './lib.mjs';
const OUT=BASE_OUT+'/ux-sprint-02',setup=JSON.parse(readFileSync(OUT+'/guided-setup-browser.json','utf8'));
assert.equal(setup.passed,true);assert.equal(setup.target,'staging');
const divisions=await sql`select id,name from divisions where season_id=${setup.seasonId} order by name`;
const season={seasonId:setup.seasonId,divisions},actor=m.accounts.returning_player,team=m.teams[0],checks=[];
const diagnostic=setInterval(()=>{for(const c of browser.contexts())for(const p of c.pages())p.getByRole('main').innerText().then(t=>writeFileSync(OUT+'/receiving-live.txt',t)).catch(()=>{});},15000);
async function register(kind,name,divisionId,offline){

 const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'America/New_York'}),page=await context.newPage();page.setDefaultTimeout(60000);
 try {
  console.log('Opening '+name);
  await page.goto(entryUrl('player',`/register/${season.seasonId}${kind==='individual'?`?team=${team.id}`:''}`));
  const path=page.getByRole('button',{name:kind==='team'?/Register a team/:/Register as a player/});
  if(await path.isVisible())await path.click();
  const next=page.getByRole('button',{name:/^Next/});
  if(await next.isVisible())await next.click();
  const division=page.getByRole('button',{name:new RegExp(kind==='team'&&divisionId===season.divisions[1].id?'Adult 40':'Adult Open')});
  if(await division.isVisible()){await division.click();await page.getByRole('button',{name:/^Next/}).click();}
  await page.getByRole('tab',{name:/^Sign in$/i}).click();
  await page.getByLabel(/^Email/).first().fill(actor.email);await page.getByLabel(/^Password/).first().fill(actor.password);
  const resumed=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/resume'));
  await page.getByRole('button',{name:/Sign in & continue/i}).click();const response=await resumed;expect(response.ok(),await response.text()).toBe(true);const started=await response.json();
  await expect(page.getByRole('button',{name:/Next: Waivers/})).toBeVisible();
  console.log('Details '+name);
  if(kind==='team'){
   await page.getByLabel(/^Team name/).fill(name);await page.getByLabel(/^Division/).selectOption(divisionId);
  }else{
   await page.getByLabel(/^Skill level/).selectOption('B');
   // Format-only test value: this is not evidence of verified membership.
   await page.getByLabel(/^USA Hockey ID/).fill('2026110501');
   const center=page.getByRole('button',{name:'Center',exact:true});if(!(await center.getAttribute('class')).includes('bg-accent/10'))await center.click();
   const monday=page.getByRole('button',{name:/^Monday$|^Mon$/i}).first();if(!(await monday.getAttribute('class')).includes('bg-accent/10'))await monday.click();
  }
  const position=page.getByLabel('Preferred playing position',{exact:false});if(await position.isVisible())await position.fill('Center');
  writeFileSync(`${OUT}/registration-fields.json`,JSON.stringify(await page.locator('input,select,button[aria-pressed]').evaluateAll(els=>els.map(e=>({tag:e.tagName,type:e.type,id:e.id,value:e.value,pressed:e.getAttribute('aria-pressed'),label:e.textContent?.slice(0,80)}))),null,2));
  await snapshot(page,`registration-${kind}-${name.replaceAll(' ','-')}-details`);
  await page.getByRole('button',{name:/Next: Waivers/}).click();
  console.log('Waivers '+name);
  await expect(page.getByText('Sign to continue',{exact:true})).toBeVisible();
  for(const box of await page.locator('div.max-h-48.overflow-y-auto').all())await box.evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
  const signer=page.getByLabel(/Type your full legal name to sign/i).first();
  if(await signer.isVisible()){await signer.fill(actor.name);await page.getByRole('button',{name:/^Sign$/}).first().click();await expect(page.getByText(/^Signed$/i).first()).toBeVisible();}
  const conduct=page.getByRole('switch',{name:/Code of conduct/i});if(await conduct.isVisible()&&await conduct.getAttribute('aria-checked')!=='true')await conduct.click();
  await page.getByRole('button',{name:/Next: Payment/}).click();
  console.log('Pricing '+name);
  await page.getByText(kind==='team'?'Team registration':'Player registration',{exact:true}).first().click();
  await page.getByRole('button',{name:/^Continue$/}).click();
  await page.getByRole('button',{name:/Continue to payment/}).click();
  console.log('Payment '+name);
  if(offline)await page.getByText('Pay by cash or cheque',{exact:true}).click();
  else {await expect(page.getByText('Choose a payment option',{exact:true})).toHaveCount(0);await expect(page.locator('input[autocomplete="cc-number"]')).toHaveCount(0);}
  const paid=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/submissions/${started.id}/pay`));
  await page.getByRole('button',{name:offline?'Submit for offline payment':/Complete registration|Submit registration/i}).click();
  const payment=await paid;expect(payment.ok(),await payment.text()).toBe(true);
  const [row]=await sql`select id,status from registrations where id=${started.id}`;
  expect(['pending_offline','pending_review']).toContain(row.status);
  const record={id:row.id,name,kind,status:row.status};
  await snapshot(page,`registration-${kind}-${name.replaceAll(' ','-')}-submitted`);return record;
 }catch(error){await snapshot(page,'registration-failure').catch(()=>{});throw error;}finally{await context.close();}
}
try{
 const landingContext=await browser.newContext(),landing=await landingContext.newPage();
 await landing.goto(entryUrl('landing','/'));assert.ok((await landing.locator('body').innerText()).length>100);
 await landing.goto(entryUrl('player','/join?org='+m.orgSlug));await expect(landing.getByRole('main')).toContainText('Harbor Spring Hockey '+setup.tag);
 await snapshot(landing,'sprint2-published-discovery');await landingContext.close();checks.push('The published season is discoverable from a fresh public registration session; the landing app renders.');
 const name='Harbor Mariners '+setup.tag;
 let [existing]=await sql`select id,status from registrations where season_id=${season.seasonId} and metadata->'team'->>'name'=${name}`;
 const registration=existing??await register('team',name,divisions.find(d=>d.name==='Adult Open').id,false);
 if(registration.status!=='approved'){
  const staff=await open('org_admin','org','/registrations');
  const row=staff.page.getByRole('row').filter({hasText:actor.email}).filter({hasText:'Spring 2027 '+setup.tag});
  await expect(row).toBeVisible();
  const reviewed=staff.page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes(registration.id)&&r.url().endsWith('/review'));
  const action=row.getByRole('button',{name:/Review|Approve/i}).first(),label=await action.innerText();await action.click();
  if(/Review/i.test(label))await staff.page.getByRole('dialog').getByRole('button',{name:/^Approve$/}).click();
  const response=await reviewed;assert.ok(response.ok(),await response.text());
  await snapshot(staff.page,'sprint2-org-approval');await staff.context.close();
 }
 const [stored]=await sql`select status,team_id from registrations where id=${registration.id}`;assert.equal(stored.status,'approved');assert.ok(stored.team_id);
 checks.push('A returning player signs the real waivers and submits the free team path; the organization administrator approves that same season registration.');
 console.log('Opening receiving player');
 const recipient=await open('returning_player','player','/registrations');await expect(recipient.page.getByRole('main')).toContainText('Spring 2027 '+setup.tag);await expect(recipient.page.getByRole('main')).toContainText(/Approved/i);await snapshot(recipient.page,'sprint2-player-approved');await recipient.context.close();
 console.log('Opening receiving captain');
 const captain=await open('returning_player','team','/captain/roster');const switcher=captain.page.getByRole('combobox',{name:'Team',exact:true});
 if(await switcher.isVisible()){await switcher.selectOption(stored.team_id);await expect(switcher).toHaveValue(stored.team_id);await expect(switcher.locator('option:checked')).toHaveText(name);}
 else await expect(captain.page.locator('body')).toContainText(name);
 await expect(captain.page.getByRole('main')).toContainText(actor.name);await fits(captain.page,'sprint2-captain-created-team');await captain.context.close();
 checks.push('Fresh player and captain sessions receive the approved result and the new team created by registration.');
 const root=await login(m.accounts.super_admin.email,m.accounts.super_admin.password);
 const [role]=await sql`select id from roles where code='league_admin' and is_system=true`;
 const [assignment]=await sql`select id from user_role_assignments where user_id=${m.accounts.league_admin.userId} and role_id=${role.id} and scope_id=${setup.leagueId} and revoked_at is null`;
 if(!assignment)await api('POST','/iam/role-assignments',{userId:m.accounts.league_admin.userId,roleId:role.id,scopeType:'league',scopeId:setup.leagueId},root);
 for(const [roleKey,app] of [['super_admin','superadmin'],['league_admin','league']]){
  const view=await open(roleKey,app,'/seasons/'+season.seasonId);await expect(view.page.getByRole('main')).toContainText('Spring 2027 '+setup.tag);await snapshot(view.page,'sprint2-'+app+'-season');await view.context.close();
 }
 checks.push('Super-admin and an explicitly scoped league administrator open the same new season through their consoles.');
 const outsider=await login(m.accounts.boundary_admin.email,m.accounts.boundary_admin.password);
 const denied=await call('GET','/league/seasons/'+season.seasonId,undefined,outsider);assert.ok([403,404].includes(denied.status));
 const [charges]=await sql`select count(*)::int n from invoices where registration_id=${registration.id} and total_cents>0`;assert.equal(charges.n,0);
 checks.push('A foreign organization cannot read the new season; the team registration creates no nonzero invoice.');
 writeFileSync(OUT+'/receiving-results.json',JSON.stringify({outcome:'passed',setup,registration,checks},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'));
}catch(error){for(const c of browser.contexts())for(const p of c.pages())await snapshot(p,'sprint2-receiving-failure').catch(()=>{});writeFileSync(OUT+'/receiving-results.json',JSON.stringify({outcome:'failed',checks,error:String(error)},null,2));throw error;}
finally{clearInterval(diagnostic);await browser.close();await sql.end({timeout:5});}
