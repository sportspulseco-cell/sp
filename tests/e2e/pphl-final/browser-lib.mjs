import {writeFileSync,mkdirSync} from 'node:fs';
import {chromium,expect as baseExpect} from '@playwright/test';
import {loadManifest,saveManifest,OUT,entryUrl,apps,SUPABASE_IP} from './lib.mjs';
export const expect=baseExpect.configure({timeout:30000});
export const m=loadManifest();
export const save=()=>{const latest=loadManifest();saveManifest({...latest,...m,rehearsal:{...latest.rehearsal,...m.rehearsal}});};
export const browser=await chromium.launch({args:[`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`]});
mkdirSync(`${OUT}/evidence`,{recursive:true});
export async function open(role,app=m.accounts[role].app,path='/'){
 const a=m.accounts[role],context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'America/New_York'}),page=await context.newPage();page.setDefaultTimeout(60000);
 await page.goto(entryUrl(app));await page.locator('input[type=email]').fill(a.email);await page.locator('input[type=password]').fill(a.password);await page.locator('button[type=submit]').click();
 await page.waitForURL(u=>!u.pathname.startsWith('/sign-in')&&!u.pathname.startsWith('/onboarding'));
 await page.goto(apps[app]+path);return{context,page,app,base:apps[app]};
}
export async function snapshot(page,name){writeFileSync(`${OUT}/evidence/${name}.txt`,await page.getByRole('main').innerText({timeout:10000}).catch(()=>page.locator('body').innerText({timeout:10000})));await page.screenshot({path:`${OUT}/evidence/${name}.png`,fullPage:true,timeout:10000});}
export async function fits(page,name){for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1100});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}px`).toBe(true);}await snapshot(page,name);}
