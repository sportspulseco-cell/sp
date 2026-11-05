import {writeFileSync,mkdirSync} from 'node:fs';
import {chromium,expect as baseExpect} from '@playwright/test';
import {loadManifest,sql,login,call,OUT,entryUrl,apps,SUPABASE_IP} from './lib.mjs';
const m=loadManifest(),expect=baseExpect.configure({timeout:15000}),checks=[];
const browser=await chromium.launch({args:[`--host-resolver-rules=MAP *.supabase.co ${SUPABASE_IP}`]});
mkdirSync(`${OUT}/evidence`,{recursive:true});
const plans={super_admin:['superadmin','/users'],org_admin:['org','/seasons'],league_admin:['league','/seasons'],season_admin:['superadmin','/seasons'],division_admin:['superadmin',`/divisions/${m.leagues[0].divisions[0].id}`],registrar:['superadmin','/registrations'],scorekeeper:['superadmin','/games'],referee:['superadmin','/games'],captain:['team','/captain/roster'],coach:['team','/roster'],player:['player','/team'],parent:['player','/'],spectator:['player','/']};
function safe(error){let s=String(error);for(const a of Object.values(m.accounts))s=s.replaceAll(a.password,'[redacted]');for(const app of Object.keys(apps)){const secret=new URL(entryUrl(app)).searchParams.get('x-vercel-protection-bypass');if(secret)s=s.replaceAll(secret,'[redacted]');}return s.slice(0,1000);}
try {
 for(const [key,[app,route]] of Object.entries(plans)){
  const account=m.accounts[key],context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(30000);
  let result={role:key,app,route,evidence:['dom-snapshot','screenshot','http-response'],outcome:'pass'};
  try {
   const token=await login(account.email,account.password),me=await call('GET','/iam/me/scope',undefined,token);
   if(me.status!==200)throw Error(`Scope HTTP ${me.status}`);
   if(key==='super_admin'){const season=await call('GET','/league/seasons/'+m.leagues[0].seasonId,undefined,token);if(season.status!==200)throw Error('Profile-only super admin cannot open a season: '+season.status);}
   await page.goto(entryUrl(app));await page.locator('input[type=email]').fill(account.email);await page.locator('input[type=password]').fill(account.password);await page.locator('button[type=submit]').click();
   await page.waitForURL(u=>!u.pathname.startsWith('/sign-in')||u.searchParams.has('error'),{timeout:45000});
   if(['parent','spectator'].includes(key)){
    await expect(page.getByRole('main')).toContainText(/role|access|sign in/i);result.outcome='expected_restriction';result.note=key==='parent'?'Guardian acts through a consent link; a dedicated parent dashboard is not included in this round.':'Public viewing scope is unresolved; no private player/admin access is granted.';
   } else {
    if(new URL(page.url()).pathname.startsWith('/sign-in'))throw Error('Role was rejected at sign-in');
    await page.goto(apps[app]+route);
    const body=await page.getByRole('main').innerText();
    if(/This page is not here|We couldn't load this page|Application error|Could not load/i.test(body))throw Error('The role workspace displays a load/not-found error');
    if(key==='season_admin')await expect(page.getByRole('main')).toContainText('Winter 2026-27');
    if(key==='league_admin')await expect(page.getByRole('main')).toContainText(m.leagues[0].name);
    if(['scorekeeper','referee'].includes(key))await expect(page.getByRole('link',{name:/Finance|Organizations|Users/,exact:true})).toHaveCount(0);
    if(['coach','player'].includes(key))await expect(page.getByRole('main')).toContainText('Harbor Hawks');
    if(key==='captain')await expect(page.getByRole('main')).toContainText('Ava Thompson');
   }
   const denied=await call('GET','/notifications/summary',undefined,token);
   if(key!=='super_admin'&&denied.status!==403)throw Error(`Global outbox summary is visible (${denied.status})`);
  }catch(error){result.outcome='blocked';result.error=safe(error);}
  await page.screenshot({path:`${OUT}/evidence/role-${key}.png`,fullPage:true}).catch(()=>{});
  writeFileSync(`${OUT}/evidence/role-${key}.txt`,await page.locator('body').innerText().catch(()=>''));
  checks.push(result);console.log(`${result.outcome.toUpperCase()} ${key}${result.error?' '+result.error.split('\n')[0]:''}`);await context.close();
 }
}finally{await browser.close();await sql.end({timeout:5});writeFileSync(`${OUT}/role-results.json`,JSON.stringify({checks,passed:checks.filter(c=>c.outcome==='pass').length,blocked:checks.filter(c=>c.outcome==='blocked').length},null,2));}
process.exitCode=checks.some(c=>c.outcome==='blocked')?1:0;
