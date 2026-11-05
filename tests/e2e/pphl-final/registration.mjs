import {writeFileSync} from 'node:fs';
import {m,save,browser,expect,open,snapshot,fits} from './browser-lib.mjs';
import {sql,OUT,apps,entryUrl} from './lib.mjs';
m.rehearsal??={};m.rehearsal.registrations??=[];
const checks=[],season=m.leagues[0],actor=m.accounts.returning_player,team=m.teams[0];
const diagnostic=setInterval(()=>{for(const context of browser.contexts())for(const page of context.pages())snapshot(page,'registration-live').catch(()=>{});},20000);
async function register(kind,name,divisionId,offline){
 const previous=m.rehearsal.registrations.find(r=>r.name===name);
 if(previous)return previous;
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
  const record={id:row.id,name,kind,status:row.status};m.rehearsal.registrations.push(record);save();
  await snapshot(page,`registration-${kind}-${name.replaceAll(' ','-')}-submitted`);return record;
 }catch(error){await snapshot(page,'registration-failure').catch(()=>{});throw error;}finally{await context.close();}
}
try {
 const anonymous=await browser.newContext(),publicPage=await anonymous.newPage();await publicPage.goto(entryUrl('landing','/'));expect((await publicPage.locator('body').innerText()).length).toBeGreaterThan(100);
 console.log('Landing opened');
 await publicPage.goto(entryUrl('player',`/join?org=${m.orgSlug}`));await expect(publicPage.getByRole('main')).toContainText(m.orgName);await snapshot(publicPage,'public-registration-discovery');await anonymous.close();checks.push('Public league registration opens without an account and identifies the correct testing organization.');
 await register('individual','Luca Martinez offline player',season.divisions[0].id,true);
 await register('team','Harbor United',season.divisions[0].id,false);
 await register('team','Riverside Legends',season.divisions[1].id,false);
 expect(new Set(m.rehearsal.registrations.map(r=>r.id)).size).toBe(3);
 checks.push('One returning account submits offline player registration and two distinct free team registrations without blocking, card input or a non-zero team charge.');
 const registrar=await open('registrar','superadmin','/registrations');
 for(let n=0;n<3;n++){
  const unreviewed=m.rehearsal.registrations.filter(r=>!r.approved);if(!unreviewed.length)break;
  const row=registrar.page.getByRole('row').filter({hasText:actor.email}).first();await expect(row).toBeVisible();
  await row.getByRole('button',{name:/Review|Approve/i}).first().click();
  const dialog=registrar.page.getByRole('dialog');
  const action=registrar.page.waitForResponse(r=>r.request().method()==='POST'&&/\/admin\/submissions\/[^/]+\/review$/.test(r.url()));
  if(await dialog.isVisible())await dialog.getByRole('button',{name:/^Approve$/}).click();
  const rr=await action;expect(rr.ok(),await rr.text()).toBe(true);const id=rr.url().split('/submissions/')[1].split('/')[0];const rec=m.rehearsal.registrations.find(r=>r.id===id);expect(rec).toBeTruthy();rec.approved=true;save();
  await expect.poll(async()=>Number((await sql`select count(*)::int n from registrations where id in ${sql(m.rehearsal.registrations.map(r=>r.id))} and status='approved'`)[0].n)).toBe(m.rehearsal.registrations.filter(r=>r.approved).length);
 }
 await snapshot(registrar.page,'registrar-reviewed-submissions');await registrar.context.close();checks.push('The season-scoped registrar reviews all three submissions in the actual console; approved rows leave the pending queue.');
 const player=await open('returning_player','player','/registrations');await expect(player.page.getByRole('main')).toContainText(/Approved/i);await snapshot(player.page,'player-approved-registration');await player.context.close();
 const captain=await open('captain','team','/captain/roster');await expect(captain.page.getByRole('main')).toContainText(actor.name);await fits(captain.page,'captain-roster-after-registration');await captain.context.close();checks.push('Fresh player and captain sessions show the approved registration and the same newly rostered person.');
 const [charges]=await sql`select count(*)::int n from invoices where registration_id in ${sql(m.rehearsal.registrations.filter(r=>r.kind==='team').map(r=>r.id))} and total_cents>0`;expect(charges.n).toBe(0);
 m.rehearsal.registrationPassed=true;save();
 writeFileSync(`${OUT}/registration-results.json`,JSON.stringify({outcome:'passed',checks,registrations:m.rehearsal.registrations},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'));
}catch(error){writeFileSync(`${OUT}/registration-results.json`,JSON.stringify({outcome:'failed',checks,error:String(error).slice(0,1500)},null,2));throw error;}
finally{clearInterval(diagnostic);await browser.close();await sql.end({timeout:5});}
