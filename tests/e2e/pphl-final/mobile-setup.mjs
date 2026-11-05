import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,expect as baseExpect} from '@playwright/test';
import {loadManifest,CFG,OUT,sql,SUPABASE_IP} from './lib.mjs';

// Real staging reads through local frontends. No fixture records are created.
const m=loadManifest(),dir=OUT+'/mobile-first-setup',expect=baseExpect.configure({timeout:30000}),checks=[];
mkdirSync(dir+'/shots',{recursive:true});
const browser=await chromium.launch({args:[`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`]});
let page;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function shot(name){await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);});await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);await page.screenshot({path:dir+'/shots/'+name+'.png'});}
async function next(name){const button=page.getByRole('button',{name,exact:true});await expect(button).toBeEnabled();await button.tap();}
async function actions(name){await page.getByLabel('Division actions',{exact:true}).tap();await page.getByRole('button',{name,exact:true}).tap();}
try{
 for(const [role,app,port] of [['org_admin','org',3107],['super_admin','superadmin',3108]]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,timezoneId:'America/New_York',locale:'en-US'});
  await context.route(CFG.api+'/**',async route=>{const r=route.request(),headers=r.headers();delete headers.origin;delete headers.host;const response=await fetch(r.url(),{method:r.method(),headers,body:r.postDataBuffer()??undefined});await route.fulfill({status:response.status,headers:{'content-type':response.headers.get('content-type')??'application/json'},body:Buffer.from(await response.arrayBuffer())});});
  page=await context.newPage();page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:'+port+'/sign-in');
  await page.locator('input[type=email]').fill(m.accounts[role].email);await page.locator('input[type=password]').fill(m.accounts[role].password);await page.locator('button[type=submit]').tap();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));
  await page.evaluate(key=>localStorage.removeItem(key),'sportspulse:season-setup:'+m.accounts[role].userId);
  await page.goto('http://localhost:'+port+'/org-setup');
  if(app==='superadmin'){
   await page.getByRole('button',{name:'Open command palette',exact:true}).tap();
   await expect(page.getByRole('dialog',{name:'Command palette',exact:true})).toBeVisible();
   await page.getByPlaceholder('Find a page…').fill('Seasons');
   await expect(page.getByRole('dialog').getByRole('button',{name:'Seasons /seasons',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Close',exact:true}).tap();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.getByRole('button',{name:new RegExp(m.orgName)}).tap();await next('Next: League');
  }
  for(const name of ['Open menu','Account']){const box=await page.getByRole('button',{name,exact:true}).boundingBox();assert.ok(box.height>=44&&box.width>=44,name+' has a phone touch target');}
  const league=page.getByLabel('League name',{exact:false});await league.fill('Harbor Mobile Hockey');await page.getByLabel('Sport',{exact:false}).selectOption('HOCKEY_ICE');
  await shot(app+'-league');
  assert.ok((await league.boundingBox()).y<500,'First answer is near the top of the phone');
  // Emulate keyboard-reduced visual space. This is not a physical OS keyboard test.
  await league.focus();await page.setViewportSize({width:390,height:430});
  await expect(page.locator('[data-keyboard-open=true]')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Next: Season',exact:true})).not.toBeVisible();
  await league.press('Enter');await expect(league).not.toBeFocused();
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Next: Season',exact:true})).toBeVisible();
  await next('Next: Season');
  await page.getByLabel('Season name',{exact:false}).fill('Spring 2027');await page.getByLabel('Season start date',{exact:false}).fill('2027-01-02');await page.getByLabel('Season end date',{exact:false}).fill('2027-04-30');
  await shot(app+'-dates');await next('Next: Registration dates');
  await page.getByLabel('Registration opens',{exact:false}).fill(today);await page.getByLabel('Registration closes',{exact:false}).fill('2027-01-01');await next('Next: Playoffs');await next('Next: Divisions');
  const division=()=>page.getByLabel('Division name',{exact:false}).filter({visible:true});
  await division().fill('Adult Open');await division().press('Enter');
  await expect(page.getByLabel('Max teams',{exact:false}).filter({visible:true})).toBeFocused();
  await page.getByLabel('Max teams',{exact:false}).filter({visible:true}).press('Enter');
  await actions('Copy Division 1');
  await expect(page.getByRole('button',{name:'Next: Registration',exact:true})).toBeDisabled();
  await division().fill('Adult 40+');await division().press('Tab');
  const picker=page.getByRole('combobox',{name:'Division to edit',exact:true});
  await expect(picker.locator('option')).toHaveCount(2);
  const values=await picker.locator('option').evaluateAll(options=>options.map(o=>o.value));
  await picker.selectOption(values[0]);await page.getByLabel('Max teams',{exact:false}).filter({visible:true}).fill('8');await page.getByLabel('Max teams',{exact:false}).filter({visible:true}).press('Tab');
  await picker.selectOption(values[1]);await expect(page.getByLabel('Max teams',{exact:false}).filter({visible:true})).toHaveValue('10');
  await picker.selectOption(values[0]);await expect(page.getByLabel('Max teams',{exact:false}).filter({visible:true})).toHaveValue('8');
  await picker.selectOption(values[1]);await actions('Remove division');await expect(picker.locator('option')).toHaveCount(1);await expect(division()).toHaveValue('Adult Open');
  await actions('Add another division');await expect(division()).toBeFocused();await division().fill('Adult 40+');await division().press('Tab');
  await shot(app+'-divisions');
  await next('Next: Registration');await page.getByLabel('Player registration price').fill('185.50');await page.getByRole('checkbox',{name:'Require USA Hockey membership'}).check();
  const docs=page.locator('summary').filter({hasText:'Documents and questions'});await docs.tap();await expect(page.getByRole('button',{name:/Custom questions/i})).toBeVisible();await docs.tap();
  await shot(app+'-registration');await next('Next: Review');await expect(page.getByRole('button',{name:'Publish registration',exact:true})).toBeDisabled();await shot(app+'-review');
  await next('Back');await expect(page.getByLabel('Player registration price')).toHaveValue('185.50');await expect(page.getByRole('checkbox',{name:'Require USA Hockey membership'})).toBeChecked();
  await page.reload();await expect(page.getByLabel('Player registration price')).toHaveValue('185.50');
  const stepMenu=page.locator('nav[aria-label="Season setup progress"] details[data-phone-menu]');
  await stepMenu.locator('summary').tap();await stepMenu.getByRole('button',{name:/Season/}).tap();
  await page.getByRole('combobox',{name:'Date questions',exact:true}).selectOption('season');await expect(page.getByLabel('Season name',{exact:false})).toHaveValue('Spring 2027');
  for(const theme of ['light','dark']){
   const toggle=page.getByRole('button',{name:'Switch to '+theme+' mode'});if(await toggle.isVisible())await toggle.tap();
   for(const width of [320,375,390,414]){
    await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),app+' '+theme+' '+width);
    await shot(app+'-season-'+theme+'-'+width);
    const footer=await page.getByRole('button',{name:'Next: Registration dates',exact:true}).boundingBox();assert.ok(footer.height>=44&&footer.y+footer.height<=844,'Primary action is thumb-sized and in view');
   }
  }
  assert.deepEqual(errors,[],'No browser exceptions');
  await page.evaluate(key=>localStorage.removeItem(key),'sportspulse:season-setup:'+m.accounts[role].userId);await context.close();
  checks.push(app+': phone touch journey, division add/copy/switch/remove, Enter navigation, emulated keyboard height, draft refresh and Back, light/dark at four phone widths; no publish.');
 }
 writeFileSync(dir+'/results.json',JSON.stringify({outcome:'passed',frontendBuild:process.env.UX_BUILD??'development',checks,limitation:'Chromium mobile emulation; physical iOS/Android keyboard and screen reader checks remain.'},null,2));console.log(checks.map(x=>'PASS '+x).join('\n'));
}catch(error){if(page){writeFileSync(dir+'/failure.txt',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:dir+'/shots/failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally{await browser.close();await sql.end({timeout:5});}
