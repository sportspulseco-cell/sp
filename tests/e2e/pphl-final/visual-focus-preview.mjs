import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {chromium,expect as baseExpect} from '@playwright/test';
import {loadManifest,CFG,OUT,sql,SUPABASE_IP,entryUrl,apps} from './lib.mjs';
const evidenceDir=process.env.VISUAL_EVIDENCE_DIR??'visual-focus';
if(!/^[a-z0-9-]+$/.test(evidenceDir))throw Error('Invalid evidence directory');
const m=loadManifest(),dir=OUT+'/'+evidenceDir,expect=baseExpect.configure({timeout:30000}),checks=[];mkdirSync(dir+'/shots',{recursive:true});mkdirSync(dir+'/motion',{recursive:true});
const browser=await chromium.launch({args:[`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`]});
let page;
async function captureStage(page,app,stage){
 for(const theme of ['light','dark']){
  const toggle=page.getByRole('button',{name:'Switch to '+theme+' mode'});if(await toggle.isVisible())await toggle.click();
  for(const width of [320,375,414,768,1440]){
   await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),stage+' '+theme+' '+width);
   await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);});
   await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
   await page.screenshot({path:dir+'/shots/'+app+'-'+stage+'-'+theme+'-'+width+'.png',fullPage:true});
  }
 }
}
try{
 for(const [role,app,port] of [['org_admin','org',3107],['super_admin','superadmin',3108]]){
  const base=process.env.UX_TARGET==='staging'?apps[app]:'http://localhost:'+port;
  const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:role==='org_admin'?{dir:dir+'/motion',size:{width:1440,height:1000}}:undefined});
  if(base.startsWith('http://localhost'))await context.route(CFG.api+'/**',async route=>{const r=route.request(),headers=r.headers();delete headers.origin;delete headers.host;const response=await fetch(r.url(),{method:r.method(),headers,body:r.postDataBuffer()??undefined});await route.fulfill({status:response.status,headers:{'content-type':response.headers.get('content-type')??'application/json'},body:Buffer.from(await response.arrayBuffer())});});
  page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(base.startsWith('http://localhost')?base+'/sign-in':entryUrl(app));
  await page.locator('input[type=email]').fill(m.accounts[role].email);await page.locator('input[type=password]').fill(m.accounts[role].password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));await page.goto(base+'/org-setup');
  if(app==='superadmin'){await page.getByRole('button',{name:new RegExp(m.orgName)}).click();await page.getByRole('button',{name:'Next: League',exact:true}).click();}
  await page.getByLabel('League name',{exact:false}).fill('Harbor Hockey League');await page.getByLabel('Sport',{exact:false}).selectOption('HOCKEY_ICE');
  await expect(page.getByRole('figure',{name:'Your season preview'})).toContainText('Harbor Hockey League');
  await expect(page.locator('svg[data-preview=rink]')).toHaveCount(1);
  await page.getByLabel('Sport',{exact:false}).selectOption('SOCCER');
  await expect(page.locator('svg[data-preview=calendar]')).toHaveCount(1);
  await page.getByLabel('Sport',{exact:false}).selectOption('HOCKEY_ICE');
  for(const theme of ['light','dark']){
   const toggle=page.getByRole('button',{name:'Switch to '+theme+' mode'});if(await toggle.isVisible())await toggle.click();
   for(const width of [320,375,414,768,1440]){
    await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),app+' '+theme+' '+width);
    await page.screenshot({path:dir+'/shots/'+app+'-league-'+theme+'-'+width+'.png',fullPage:true});
   }
  }
  await page.getByRole('button',{name:'Next: Season',exact:true}).click();await page.getByLabel('Season name',{exact:false}).fill('Spring 2027');await page.getByLabel('Season start date',{exact:false}).fill('2027-01-02');await page.getByLabel('Season end date',{exact:false}).fill('2027-04-30');
  await expect(page.getByRole('figure',{name:'Your season preview'})).toContainText('2027');
  await page.getByRole('button',{name:'Next: Registration dates',exact:true}).click();await page.getByLabel('Registration opens',{exact:false}).fill(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));await page.getByLabel('Registration closes',{exact:false}).fill('2027-01-01');
  await page.getByRole('button',{name:'Next: Playoffs',exact:true}).click();await expect(page.getByText("Optional. Continue if these dates aren't needed yet.",{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next: Divisions',exact:true}).click();await page.getByLabel('Division name',{exact:false}).fill('Adult Open');
  await page.getByRole('button',{name:'Copy Division 1',exact:true}).click();await page.getByLabel('Division name',{exact:false}).fill('Adult 40+');
  await expect(page.getByRole('figure',{name:'Your season preview'})).toContainText('Adult Open · Adult 40+');
  await captureStage(page,app,'divisions');
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Next: Registration',exact:true}).click();await expect(page.getByLabel('Player registration price')).toBeVisible();
  await page.getByLabel('Player registration price').fill('185.50');
  await page.getByRole('checkbox',{name:'Require USA Hockey membership'}).check();
  await captureStage(page,app,'registration');
  await page.getByRole('button',{name:'Next: Review',exact:true}).click();
  await expect(page.getByRole('button',{name:'Publish registration',exact:true})).toBeDisabled();
  await captureStage(page,app,'review');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByLabel('Division name',{exact:false})).toBeVisible();
  const toggle=page.getByRole('button',{name:'Switch to light mode'});if(await toggle.isVisible())await toggle.click();await page.getByRole('button',{name:'Step '+(app==='org'?2:3)+': Season',exact:true}).click();
  await page.getByRole('button',{name:'Season dates',exact:true}).click();await expect(page.getByLabel('Season name',{exact:false})).toHaveValue('Spring 2027');
  await page.screenshot({path:dir+'/shots/'+app+'-season-light-desktop.png',fullPage:true});
  const dark=page.getByRole('button',{name:'Switch to dark mode'});if(await dark.isVisible())await dark.click();
  await page.screenshot({path:dir+'/shots/'+app+'-season-dark-desktop.png',fullPage:true});
  await page.evaluate(key=>localStorage.removeItem(key),'sportspulse:season-setup:'+m.accounts[role].userId);
  const video=page.video();await context.close();if(video)renameSync(await video.path(),dir+'/motion/season-setup-'+app+'.webm');
  checks.push(app+': live draft preview, ordered step handoffs, preserved values, reduced motion, light/dark and five responsive widths.');
 }
 writeFileSync(dir+'/preview-results.json',JSON.stringify({outcome:'passed',checks},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'));
}catch(error){if(page){writeFileSync(dir+'/preview-failure.txt',await page.getByRole('main').innerText().catch(()=>''));await page.screenshot({path:dir+'/shots/preview-failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally{await browser.close();await sql.end({timeout:5});}
