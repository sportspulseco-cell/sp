import {writeFileSync} from 'node:fs';
import {loadManifest,sql,api,login,call,OUT} from './lib.mjs';
const m=loadManifest(),checks=[];
try{
 const boundary=await login(m.accounts.boundary_admin.email,m.accounts.boundary_admin.password);
 let [league]=await sql`select id from leagues where org_id=${m.boundaryOrgId} and name='Riverside Community Hockey'`;
 if(!league)league=await api('POST','/league/leagues',{orgId:m.boundaryOrgId,sportCode:'HOCKEY_ICE',name:'Riverside Community Hockey'},boundary);
 let [season]=await sql`select id from seasons where league_id=${league.id}`;
 if(!season)season=await api('POST','/league/seasons',{leagueId:league.id,name:'Winter 2026-27',sportCode:'HOCKEY_ICE',startDate:'2026-11-16',endDate:'2027-03-14',timezone:'America/New_York'},boundary);
 for(const role of ['org_admin','league_admin','season_admin','registrar','division_admin','captain','player']){
  const a=m.accounts[role],token=await login(a.email,a.password);
  for(const route of [`/league/leagues/${league.id}`,`/league/seasons/${season.id}`]){const r=await call('GET',route,undefined,token);if(![403,404].includes(r.status))throw Error(`${role}: foreign route returned ${r.status}`);}
  const r=await call('GET','/league/seasons',undefined,token);if(r.status===200&&JSON.stringify(r.json).includes(season.id))throw Error(`${role}: foreign season appears in list`);
  if(['league_admin','season_admin','registrar','division_admin'].includes(role)){const other=await call('GET',`/league/seasons/${m.leagues[1].seasonId}`,undefined,token);if(![403,404].includes(other.status))throw Error(`${role}: sibling league season returned ${other.status}`);}
  if(role==='division_admin'){
   const own=await call('GET',`/league/divisions/${m.leagues[0].divisions[0].id}`,undefined,token);if(own.status!==200)throw Error('Own division cannot be read');
   const sibling=await call('GET',`/league/divisions/${m.leagues[0].divisions[1].id}`,undefined,token);if(![403,404].includes(sibling.status))throw Error('Sibling division metadata is visible');
   const list=await call('GET','/league/divisions?limit=100',undefined,token);if(list.status!==200||list.json.items.length!==1||list.json.items[0].id!==m.leagues[0].divisions[0].id)throw Error('Division list exceeds the explicit assignment');
  }
  checks.push(`${role}: foreign organization denied without list leakage${['league_admin','season_admin','registrar','division_admin'].includes(role)?'; other league season denied':''}`);
 }
 writeFileSync(OUT+'/isolation-results.json',JSON.stringify({outcome:'passed',checks},null,2));console.log('PASS '+checks.length+' roles reject foreign organization records');
}catch(error){writeFileSync(OUT+'/isolation-results.json',JSON.stringify({outcome:'failed',checks,error:String(error)},null,2));throw error;}
finally{await sql.end({timeout:5});}
