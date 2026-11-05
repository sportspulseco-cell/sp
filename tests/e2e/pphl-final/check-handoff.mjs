import {pathToFileURL} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
import {browser,expect} from './browser-lib.mjs';
import {OUT,sql,env,loadManifest} from './lib.mjs';
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(pathToFileURL(OUT+'/PPHL-acceptance-checklist.html').href);await expect(page.locator('section[data-id]')).toHaveCount(14);
 await page.locator('[data-id=L1] [data-field=result]').selectOption('Blocked');await page.locator('[data-id=L1] [data-field=tester]').fill('Checklist verification');await page.locator('[data-id=L1] [data-field=notes]').fill('Local save/export check; not a PPHL acceptance result.');await page.locator('h1').click();await page.reload();await expect(page.locator('[data-id=L1] [data-field=result]')).toHaveValue('Blocked');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export results'}).click();await(await download).saveAs(OUT+'/checklist-export-verification.json');const data=JSON.parse(readFileSync(OUT+'/checklist-export-verification.json','utf8'));expect(data.cases.length).toBe(14);expect(data.cases[0].tester).toBe('Checklist verification');
 await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.locator('[data-id=L1] [data-field=result]')).toHaveValue('Not run');await page.screenshot({path:OUT+'/evidence/handoff-checklist.png',fullPage:true,timeout:15000});
 const access=readFileSync(OUT+'/PPHL-private-test-access.html','utf8'),owner=loadManifest().accounts.super_admin;expect(access.includes(owner.password)).toBe(false);
 for(const key of ['GH_TOKEN','GITHUB_TOKEN','VERCEL_TOKEN','HF_TOKEN','STAGING_SUPABASE_SERVICE_ROLE_KEY','STAGING_DB_PASSWORD'])if(env[key]?.length>10)expect(access.includes(env[key])).toBe(false);
 writeFileSync(OUT+'/handoff-results.json',JSON.stringify({outcome:'passed',checks:['14 editable acceptance cases render, save across refresh and export the recorded result.','Blank handoff starts Not run; engineering checks do not prefill PPHL acceptance.','Client access excludes internal platform password and infrastructure credentials.']},null,2));console.log('PASS editable checklist persistence/export and client access separation');
}finally{await browser.close();await sql.end({timeout:5});}
