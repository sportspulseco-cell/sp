import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {CFG,OUT,sql,auth,api,login,kernel,loadManifest} from './lib.mjs';
const file=OUT+'/scale.private.json',main=loadManifest();
const m=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{sources:[],account:{name:'Jamie Sullivan',email:'pphl.final+scale-operator@sportspulse.us',password:'Pp!9'+randomBytes(18).toString('base64url')}};
const save=()=>writeFileSync(file,JSON.stringify(m,null,2));
try {
 const root=await login(CFG.superAdmin.email,CFG.superAdmin.password);
 if(!m.orgId){const r=await api('POST','/orgs',{slug:'pphl-scale-rehearsal',legalName:'PPHL Scale Rehearsal',displayName:'PPHL Scale Rehearsal',orgType:'league_operator',countryCode:'US',defaultLocale:'en-US',defaultCurrency:'USD',defaultTimezone:'America/New_York'},root);m.orgId=r.id;save();}
 if(!m.account.userId){const {data,error}=await auth.auth.admin.createUser({email:m.account.email,password:m.account.password,email_confirm:true,user_metadata:{full_name:m.account.name},app_metadata:{role_codes:['org_admin'],profile_complete:true,pphl_final_testing:'pphl-scale-2026-11-05'}});if(error)throw Error(error.code);m.account.userId=data.user.id;save();}
 await sql`update profiles set display_name='Jamie Sullivan',legal_first_name='Jamie',legal_last_name='Sullivan',country_code='US',timezone='America/New_York',status='active' where id=${m.account.userId}`;
 const [role]=await sql`select id from roles where code='org_admin' and is_system=true`;
 if(!(await sql`select id from user_role_assignments where user_id=${m.account.userId} and role_id=${role.id} and scope_id=${m.orgId} and revoked_at is null`).length)await api('POST','/iam/role-assignments',{userId:m.account.userId,roleId:role.id,scopeType:'org',scopeId:m.orgId},root);
 const token=await login(m.account.email,m.account.password);
 if(!m.templateId){
  const l=await api('POST','/league/leagues',{orgId:m.orgId,sportCode:'HOCKEY_ICE',name:'PPHL Season Template'},token);m.templateLeagueId=l.id;save();
  const s=await api('POST','/league/seasons',{leagueId:l.id,name:'Winter 2026-27',sportCode:'HOCKEY_ICE',startDate:'2026-11-16',endDate:'2027-03-14',playoffStartDate:'2027-03-01',playoffEndDate:'2027-03-14',timezone:'America/New_York',registrationOpensAt:'2026-11-10T00:00:00Z',registrationClosesAt:'2026-11-16T00:00:00Z'},token);m.templateId=s.id;save();
  for(const name of ['Adult Open','Adult 40+'])await api('POST','/league/divisions',{seasonId:s.id,name,genderEligibility:'open',ruleSetOverrides:kernel.defaultDivisionRules(),playoffConfig:{...kernel.defaultDivisionRules().playoffConfig,enabled:true,playoffSpots:null,overtimeRule:'sudden_death'}},token);
  await api('POST',`/registration-v2/seasons/${s.id}/registration-setup`,{requestId:randomUUID(),registrationType:'both',playerPriceCents:18500,teamFeeEnabled:false,teamPriceCents:0,currency:'USD',requireUsaHockeyId:false,formDefinition:kernel.emptyFormDefinition(),publish:false,reviewConfirmed:true},token);
 }
 const names=[];for(const region of ['North Metro','South Coast','East Valley','West Lakes','Central City'])for(const day of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])for(const level of ['Open','Masters'])names.push(`${region} ${day} ${level}`);
 for(const name of names){if(m.sources.some(s=>s.name===name))continue;const r=await api('POST',`/registration-v2/seasons/${m.templateId}/duplicate`,{requestId:randomUUID(),name:'Winter 2026-27',newLeagueName:name,startDate:'2026-11-16',copySchedule:false,copyTeamEntries:false},token);m.sources.push({...r,name});save();console.log(`Prepared ${m.sources.length}/70 source leagues`);}
 await sql`update leagues set status='archived' where id=${m.templateLeagueId}`;
 m.seededAt=new Date().toISOString();save();
}finally{await sql.end({timeout:5});}
