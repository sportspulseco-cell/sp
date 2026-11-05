import {readFileSync,writeFileSync} from 'node:fs';
import {browser,expect,snapshot} from './browser-lib.mjs';
import {OUT,sql,entryUrl,apps} from './lib.mjs';
const m=JSON.parse(readFileSync(OUT+'/scale.private.json','utf8')),destination='Winter 2028-29',checks=[];
try {
 expect(m.sources.length).toBe(70);
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();page.setDefaultTimeout(90000);
 await page.goto(entryUrl('org'));await page.locator('input[type=email]').fill(m.account.email);await page.locator('input[type=password]').fill(m.account.password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));
 await page.goto(apps.org+'/seasons');await page.getByRole('button',{name:'Roll forward leagues'}).click();const dialog=page.getByRole('dialog');
 const newPlan=dialog.getByRole('button',{name:'New plan',exact:true});if(await newPlan.isVisible())await newPlan.click();
 await dialog.getByLabel('New season name').fill(destination);await dialog.getByLabel('New season starts').fill('2028-11-13');
 for(const source of m.sources)await dialog.getByRole('checkbox',{name:new RegExp('^'+source.name+' Winter 2026-')}).check();
 const start=Date.now();await dialog.getByRole('button',{name:'Create 70 draft copies'}).click();await dialog.getByRole('button',{name:'Pause after current copy'}).click();
 await expect(dialog.getByRole('button',{name:'Continue / retry unfinished'})).toBeVisible();const paused=await dialog.getByRole('status').innerText();expect(paused).toMatch(/\d+ of 70 copied/);
 await snapshot(page,'bulk70-paused');await page.reload();await page.getByRole('button',{name:'Roll forward leagues'}).click();await expect(dialog.getByRole('status')).toHaveText(paused);
 await dialog.getByRole('button',{name:'Continue / retry unfinished'}).click();await expect(dialog.getByRole('status')).toHaveText(`70 of 70 copied for ${destination}.`,{timeout:900000});
 await expect(dialog.getByRole('button',{name:'All copies ready'})).toBeDisabled();
 const rows=await sql`select s.id,s.status,(select count(*)::int from divisions d where d.season_id=s.id) divisions,(select count(*)::int from registration_forms f where f.season_id=s.id and f.active_version_id is not null) live_forms,(select count(*)::int from registrations r where r.season_id=s.id) registrations,(select count(*)::int from team_memberships tm where tm.season_id=s.id) memberships,(select count(*)::int from games g where g.season_id=s.id) games from seasons s join leagues l on l.id=s.league_id where l.org_id=${m.orgId} and s.name=${destination}`;
 expect(rows.length).toBe(70);for(const row of rows){expect(row.status).toBe('draft');expect(row.divisions).toBe(2);for(const key of ['live_forms','registrations','memberships','games'])expect(row[key]).toBe(0);}
 checks.push('70 realistic leagues selected in the actual roll-forward dialog; pause, reload and resume preserve the saved plan.','Exactly 70 next-season drafts retain two divisions each, with unpublished forms and no copied registrations, live rosters or games.');
 await snapshot(page,'bulk70-completed');writeFileSync(OUT+'/bulk70-results.json',JSON.stringify({outcome:'passed',checks,copies:70,elapsedSeconds:Math.round((Date.now()-start)/1000),paused},null,2));console.log('PASS 70-league browser roll-forward');
}catch(error){for(const c of browser.contexts())for(const p of c.pages())await snapshot(p,'bulk70-failure').catch(()=>{});writeFileSync(OUT+'/bulk70-results.json',JSON.stringify({outcome:'failed',checks,error:String(error)},null,2));throw error;}
finally{await browser.close();await sql.end({timeout:5});}
