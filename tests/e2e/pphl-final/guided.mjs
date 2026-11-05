import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {loadManifest,saveManifest,OUT,sql} from './lib.mjs';
const m=loadManifest(),a=m.accounts.org_admin;
const browser=await chromium.launch();
try {
 const p=await browser.newPage({viewport:{width:256,height:256}});
 await p.setContent('<style>body{margin:0}</style><svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="40" fill="#173b66"/><circle cx="128" cy="118" r="82" fill="none" stroke="#d7e8f6" stroke-width="6"/><path d="M64 166L183 67M73 67l119 99" stroke="#8badc5" stroke-width="9"/><circle cx="128" cy="118" r="47" fill="#173b66"/><text x="128" y="136" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="54" fill="white">HH</text><text x="128" y="226" text-anchor="middle" font-family="Arial" font-size="19" letter-spacing="2" fill="white">HARBOR HAWKS</text></svg>');
 await p.locator('svg').screenshot({path:`${OUT}/harbor-hawks.png`});
}finally{await browser.close();await sql.end({timeout:5});}
const child=spawn(process.execPath,['tests/e2e/season/guided-setup-journey.mjs'],{stdio:'inherit',env:{...process.env,STAGING_ORG_EMAIL:a.email,STAGING_ORG_PASSWORD:a.password,GUIDED_ORG_NAME:m.orgName,GUIDED_PPHL_FINAL:'1',GUIDED_KEEP_FIXTURE:'1',GUIDED_LEAGUE_NAME:'Harbor Cup Setup Example',GUIDED_SEASON_NAME:'Spring 2027 Setup Example',GUIDED_LOGO_PATH:`${OUT}/harbor-hawks.png`}});
process.exitCode=await new Promise(resolve=>child.on('close',resolve));
