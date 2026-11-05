import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {m,browser,expect,open} from './browser-lib.mjs';
import {OUT,sql,apps} from './lib.mjs';
const checks=[];let active;
try{
 for(const [role,app] of [['org_admin','org'],['super_admin','superadmin']]){
  active=await open(role,app,'/org-setup');const {page,context}=active;
  if(app==='superadmin'){
   await expect(page.getByRole('heading',{name:'Which organization?'})).toBeVisible();
   await page.getByRole('button',{name:new RegExp(m.orgName)}).click();await page.getByRole('button',{name:'Next: League',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'Which league?'})).toBeVisible();
  const values=[['League name','Harbor Summer Hockey'],['Season name','Summer 2027'],['Season start date','2027-05-03'],['Season end date','2027-08-30']];
  await page.getByLabel('League name',{exact:false}).fill(values[0][1]);await page.getByLabel('Sport',{exact:false}).selectOption('HOCKEY_ICE');
  await page.getByRole('button',{name:'Next: Season',exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).toBeFocused();
  for(const [label,value] of values.slice(1))await page.getByLabel(label,{exact:false}).fill(value);
  await page.getByLabel('Season end date',{exact:false}).fill('2027-05-02');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('end date must be on or after');
  await expect(page.getByRole('button',{name:'Next: Registration dates',exact:true})).toBeDisabled();
  await page.getByLabel('Season end date',{exact:false}).fill('2027-08-30');
  for(const theme of ['light','dark']){
   const toggle=page.getByRole('button',{name:'Switch to '+theme+' mode'});if(await toggle.isVisible())await toggle.click();
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:OUT+'/ux-sprint-02/shots/'+app+'-dates-'+theme+'-'+width+'.png',fullPage:true});
   }
  }
  await page.getByRole('button',{name:'Next: Registration dates',exact:true}).click();
  await page.getByRole('button',{name:'Season dates',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Season name',{exact:false})).toHaveValue('Summer 2027');
  await page.getByRole('button',{name:'Next: Registration dates',exact:true}).click();
  await page.getByLabel('Registration opens',{exact:false}).fill('2027-05-03');await page.getByLabel('Registration closes',{exact:false}).fill('2027-05-02');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('closing on or after opening');
  await expect(page.getByRole('button',{name:'Next: Playoffs',exact:true})).toBeDisabled();
  await page.getByLabel('Registration opens',{exact:false}).fill('2026-11-05');
  await page.getByRole('button',{name:'Next: Playoffs',exact:true}).click();await page.getByRole('button',{name:'Next: Divisions',exact:true}).click();
  await page.getByLabel('Division name',{exact:false}).fill('Adult Open');await page.getByRole('button',{name:'Copy Division 1',exact:true}).click();
  await expect(page.getByLabel('Division name',{exact:false})).toHaveCount(1);await expect(page.getByRole('button',{name:'Next: Registration',exact:true})).toBeDisabled();
  await page.getByLabel('Division name',{exact:false}).fill('Adult 40+');await expect(page.getByRole('button',{name:'Next: Registration',exact:true})).toBeEnabled();
  const gameRules=page.locator('summary:visible').filter({hasText:/^Game rules/});await gameRules.click();
  await page.getByLabel('Period length',{exact:false}).fill('2017');await page.getByLabel('Period length',{exact:false}).press('Tab');
  await gameRules.click();await expect(page.getByRole('main').getByRole('alert').filter({hasText:'Period length must be'}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Next: Registration',exact:true})).toBeDisabled();
  await gameRules.click();await page.getByLabel('Period length',{exact:false}).fill('17');await page.getByLabel('Period length',{exact:false}).press('Tab');
  await expect(page.getByRole('button',{name:'Next: Registration',exact:true})).toBeEnabled();
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.evaluate(key=>localStorage.removeItem(key),'sportspulse:season-setup:'+m.accounts[role].userId);
  await context.close();checks.push(app+': correct organization path, keyboard progression, preserved dates, one expanded division, copy validation, actionable date and hidden-rule errors, light/dark and four viewport widths.');
 }
 writeFileSync(OUT+'/ux-sprint-02/layout-results.json',JSON.stringify({outcome:'passed',checks},null,2));console.log(checks.map(x=>'PASS '+x).join('\n'));
}catch(error){if(active)writeFileSync(OUT+'/ux-sprint-02/layout-failure.txt',await active.page.getByRole('main').innerText().catch(()=>''));throw error;}
finally{await browser.close();await sql.end({timeout:5});}
