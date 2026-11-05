import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium,expect as baseExpect} from '@playwright/test';
import {CFG,OUT,TARGET,SUPABASE_IP,sql} from './lib.mjs';
assert.equal(TARGET,'staging');
const expect=baseExpect.configure({timeout:30000});
const {ids}=JSON.parse(readFileSync(`${OUT}/latest.json`,'utf8'));
const tag=randomUUID(),checks=[];
const browser=await chromium.launch({args:[`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`]});
try {
 for(const [app,email] of [['team',ids.captains['Team Alpha'].email],['player',ids.players['Team Alpha'].find(p=>p.rostered).email]]) {
  const [person]=await sql`select pe.id from persons pe join auth.users u on u.id=pe.user_id where u.email=${email} limit 1`;
  assert.ok(person);
  await sql`insert into notifications(idempotency_key,template_code,channel,recipient_person_id,subject,body,payload,status,source_event,created_at,read_at)
   select ${tag}||':'||${app}||':'||n,'org.broadcast','in_app',${person.id}::uuid,'QA inbox history','Synthetic pagination fixture',
    jsonb_build_object('qaPaginationTag',${tag}::text),'sent','qa.inbox.pagination',now()-interval '1 hour'+make_interval(secs=>n),now() from generate_series(1,51) n`;
  const context=await browser.newContext(); const page=await context.newPage();page.setDefaultTimeout(90000);
  const url=new URL('/sign-in',CFG.apps[app]);url.searchParams.set('x-vercel-protection-bypass',CFG.bypass(app));url.searchParams.set('x-vercel-set-bypass-cookie','true');
  await page.goto(url.toString());await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(`Play!${ids.tag}x9`);
  await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));
  await page.goto(CFG.apps[app]+'/notifications');
  const inbox=page.getByRole('region',{name:'Your notifications'}),rows=inbox.getByRole('listitem');
  await expect(rows).toHaveCount(50);
  const initialText=await rows.first().innerText();let fail=true;
  await page.route('**/api/notifications/me?**',route=>new URL(route.request().url()).searchParams.has('cursor')&&fail?
   route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'QA older notifications unavailable'})}):route.continue());
  await inbox.getByRole('button',{name:'Older notifications',exact:true}).click();
  await expect(inbox.getByRole('alert')).toContainText('QA older notifications unavailable');await expect(rows).toHaveCount(50);
  assert.equal(await rows.first().innerText(),initialText);
  fail=false;await inbox.getByRole('button',{name:'Older notifications',exact:true}).click();
  await expect.poll(()=>rows.count()).toBeGreaterThan(50);
  const text=await rows.allTextContents();assert.ok(text.some(s=>s.includes('Synthetic pagination fixture')));
  checks.push(`${app}: first page bounded at 50; failed pagination preserves rows; retry appends history.`);
  console.log('PASS '+checks.at(-1));await context.close();
 }
 writeFileSync(`${OUT}/inbox-pagination-browser.json`,JSON.stringify({outcome:'passed',checks},null,2));
} finally {
 await browser.close();await sql`delete from notifications where payload->>'qaPaginationTag'=${tag}`;await sql.end({timeout:5});
}
