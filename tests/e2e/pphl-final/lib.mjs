import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {CFG,env,sql,login,call,pinnedRequest,SUPABASE_IP,ROOT} from '../season/lib.mjs';
assert.equal(env.SEASON_TARGET??'staging','staging');
assert.equal(env.STAGING_SUPABASE_REF,'panwqcxwtugfqekxnqsr');
assert.equal(CFG.api,'https://staging-api.sportspulse.us/api');
export {CFG,env,sql,login,call,SUPABASE_IP,ROOT};
export const OUT=path.join(ROOT,'output/pphl-final-testing-2026-11-05');
mkdirSync(OUT,{recursive:true});
export const PRIVATE=path.join(OUT,'access.private.json');
export const loadManifest=()=>JSON.parse(readFileSync(PRIVATE,'utf8'));
export const saveManifest=m=>writeFileSync(PRIVATE,JSON.stringify(m,null,2)+'\n',{mode:0o600});
export const initialManifest=()=>existsSync(PRIVATE)?loadManifest():{version:1,stage:'preparing',createdAt:new Date().toISOString(),orgSlug:'pphl-final-testing',orgName:'PPHL Final Testing',accounts:{},leagues:[],teams:[],venues:[],checks:[],policy:{payments:'mock',substituteFees:'disabled',data:'Fictional testing data; not PPHL customer records',outbound:'Only the previously approved owner inbox may receive real test email'}};
export async function api(method,url,body,token) {
 const r=await call(method,url,body,token);
 assert.ok(r.status<300,`${method} ${url}: ${r.status} ${JSON.stringify(r.json).slice(0,350)}`);
 return r.json;
}
const require=createRequire(path.join(ROOT,'apps/superadmin-api/package.json'));
const {createClient}=require('@supabase/supabase-js');
export const kernel=require('@sportspulse/kernel');
export const auth=createClient(CFG.supabaseUrl,env.STAGING_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
 const r=await pinnedRequest(String(url),{method:init?.method??'GET',headers:Object.fromEntries(new Headers(init?.headers)),body:init?.body??''});
 return new Response(r.status===204?null:r.body,{status:r.status,headers:{'content-type':'application/json'}});
}}});
export const apps={landing:'https://staging.sportspulse.us',superadmin:'https://staging-superadmin.sportspulse.us',league:'https://staging-league.sportspulse.us',...CFG.apps};
export function entryUrl(app,route='/sign-in') {const u=new URL(route,apps[app]);u.searchParams.set('x-vercel-protection-bypass',CFG.bypass(app==='league'?'superadmin':app));u.searchParams.set('x-vercel-set-bypass-cookie','true');return u.toString();}
