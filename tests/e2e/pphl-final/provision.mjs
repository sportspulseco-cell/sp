import {randomUUID,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {CFG,sql,auth,api,login,initialManifest,saveManifest,kernel} from './lib.mjs';

const m=initialManifest(), marker='pphl-final-2026-11-05';
const persist=()=>saveManifest(m);
let root;
async function account(key,name,roles,app='player',internal=false) {
 let a=m.accounts[key];
 if(!a){a={key,name,roles,app,internal,email:`pphl.final+${key.replaceAll('_','-')}@sportspulse.us`,password:`Pp!9${randomBytes(18).toString('base64url')}`};m.accounts[key]=a;persist();}
 name=a.name;
 if(!a.userId){
  const [existing]=await sql`select id,raw_app_meta_data from auth.users where email=${a.email}`;
  if(existing){assert.equal(existing.raw_app_meta_data.pphl_final_testing,marker);a.userId=existing.id;}
  else {const {data,error}=await auth.auth.admin.createUser({email:a.email,password:a.password,email_confirm:true,user_metadata:{full_name:name},app_metadata:{role_codes:roles,profile_complete:true,pphl_final_testing:marker}});
   if(error)throw Error(`Create ${key}: ${error.code??error.status}`);a.userId=data.user.id;}
  persist();
 }
 const parts=name.split(' '),first=parts[0],last=parts.slice(1).join(' ');
 await sql`update profiles set display_name=${name},legal_first_name=${first},legal_last_name=${last},dob_date='1980-03-03',country_code='US',timezone='America/New_York',status='active',metadata=metadata||jsonb_build_object('pphlFinalTesting',${marker}::text) where id=${a.userId}`;
 const [person]=await sql`select id from persons where user_id=${a.userId}`;
 if(person)a.personId=person.id;
 else {const [person]=await sql`insert into persons(user_id,legal_first_name,legal_last_name,dob_date,country_code,metadata) values(${a.userId},${first},${last},'1980-03-03','US',jsonb_build_object('pphlFinalTesting',${marker}::text)) returning id`;a.personId=person.id;}
 persist();return a;
}
async function grant(a,code,type,id) {
 const [role]=await sql`select id from roles where code=${code} and is_system=true`;assert.ok(role,code);
 const [existing]=await sql`select id from user_role_assignments where user_id=${a.userId} and role_id=${role.id} and scope_type=${type} and scope_id is not distinct from ${id}::uuid and revoked_at is null`;
 if(!existing) await api('POST','/iam/role-assignments',{userId:a.userId,roleId:role.id,scopeType:type,scopeId:id},root);
}
async function organization(slug,name,key) {
 if(m[key])return m[key];
 const [existing]=await sql`select id,metadata from orgs where slug=${slug}`;
 assert.ok(!existing||existing.metadata.pphlFinalTesting===marker,'Refusing to adopt an unrelated organization');
 const org=existing??await api('POST','/orgs',{slug,legalName:name,displayName:name,orgType:'league_operator',countryCode:'US',defaultLocale:'en-US',defaultCurrency:'USD',defaultTimezone:'America/New_York'},root);
 m[key]=org.id;persist();
 await sql`update orgs set metadata=metadata||jsonb_build_object('pphlFinalTesting',${marker}::text) where id=${org.id}`;return org.id;
}
const RULES={...kernel.defaultDivisionRules().gameRules,numberOfPeriods:3,periodLengthMin:15,minStartersToStart:3,clockType:'running',overtimeRule:'none',maxRosterSize:20,maxGuestPlayersPerGame:3};
const form=kernel.emptyFormDefinition();
form.questions=[{id:'playing-position',key:'playing_position',type:'short_text',label:'Preferred playing position',required:false,isActive:true}];
form.waivers.liabilityWaiver.content='Fictional testing season: I understand that payments are simulated and this acknowledgement is for product testing only.';
form.waivers.codeOfConduct.content='Testing participants should treat players, staff and officials respectfully. This is sample testing content.';
const firstNames=['Aiden','Benjamin','Caleb','Dylan','Elliot','Felix','Gabriel','Henry','Isaac','Jack','Kai','Logan','Miles','Nathan','Owen','Parker','Quinn','Ryan','Sebastian','Thomas','Adrian','Blake','Cameron','Declan','Evan','Finn','Gavin','Hugo','Ian','Jesse','Keegan','Leo','Maxwell','Nolan','Oscar','Patrick','Reid','Simon','Toby','Wesley'];
const lastNames=['Anderson','Bennett','Carter','Davis','Edwards','Foster','Garcia','Hayes','Irving','Johnson','Kelly','Lawson','Mitchell','Nelson','Owens','Parker','Quinn','Reed','Sullivan','Turner'];
try {
 root=await login(CFG.superAdmin.email,CFG.superAdmin.password);
 await organization(m.orgSlug,m.orgName,'orgId');
 await organization('pphl-access-boundary','Riverside Hockey Association - Access Test','boundaryOrgId');
 const definitions=[['super_admin','Alex Morgan',['super_admin'],'superadmin',true],['org_admin','Morgan Reed',['org_admin'],'org'],['league_admin','Daniel Brooks',['league_admin'],'league'],['season_admin','Olivia Chen',['season_admin'],'superadmin'],['division_admin','Marcus Hall',['division_admin'],'superadmin'],['registrar','Emma Wilson',['registrar'],'superadmin'],['scorekeeper','Noah Bennett',['scorekeeper'],'superadmin'],['referee','Taylor Brooks',['referee'],'superadmin'],['captain','Jordan Miller',['captain'],'team'],['coach','Sam Rivera',['coach'],'team'],['player','Ava Thompson',['player'],'player'],['parent','Priya Shah',['parent'],'player'],['spectator','Robin Lee',['spectator'],'landing'],['returning_player','Luca Martinez',['player'],'player'],['regional_player','Maya Patel',['player'],'player'],['minor','Ethan Shah',['player'],'player'],['boundary_admin','Cameron Ward',['org_admin'],'org',true]];
 for(const [key,name,roles,app,internal] of definitions)await account(key,name,roles,app,!!internal);
 const rootUserId=JSON.parse(Buffer.from(root.split('.')[1],'base64url').toString()).sub;
 await sql.begin(async tx=>{const [owner]=await tx`select is_super_admin from profiles where id=${rootUserId}`;assert.equal(owner.is_super_admin,true);await tx`select set_config('request.jwt.claim.sub',${rootUserId},true)`;await tx`update profiles set is_super_admin=true where id=${m.accounts.super_admin.userId}`;});
 await grant(m.accounts.org_admin,'org_admin','org',m.orgId);
 await grant(m.accounts.boundary_admin,'org_admin','org',m.boundaryOrgId);
 for(const key of ['returning_player','minor','parent','spectator'])await grant(m.accounts[key],m.accounts[key].roles[0],'org',m.orgId);
 await sql`update persons set dob_date='2011-05-12' where id=${m.accounts.minor.personId}`;
 await sql`update profiles set dob_date='2011-05-12' where id=${m.accounts.minor.userId}`;
 await sql`insert into family_links(guardian_user_id,minor_person_id,relationship,verified_at) values(${m.accounts.parent.userId},${m.accounts.minor.personId},'parent',now()) on conflict(guardian_user_id,minor_person_id) do nothing`;
 const operator=await login(m.accounts.org_admin.email,m.accounts.org_admin.password);
 for(const [key,name] of [['north','North Metro'],['south','South Coast']]) {
  if(!m.regions)m.regions={};
  if(!m.regions[key]){const [r]=await sql`insert into regions(org_id,name) values(${m.orgId},${name}) returning id`;m.regions[key]=r.id;persist();}
 }
 const leagueDefs=[{name:'North Metro Weeknight Hockey',region:'north',divisions:['Adult Open','Adult 40+']},{name:'North Metro Sunday Hockey',region:'north',divisions:['Adult Open']},{name:'South Coast Evening Hockey',region:'south',divisions:['Adult Open']}];
 for(const def of leagueDefs){
  let l=m.leagues.find(l=>l.name===def.name);
  if(!l){const created=await api('POST','/league/leagues',{orgId:m.orgId,sportCode:'HOCKEY_ICE',name:def.name},operator);l={id:created.id,name:def.name,divisions:[],region:def.region};m.leagues.push(l);persist();}
  if(!l.seasonId){const s=await api('POST','/league/seasons',{leagueId:l.id,name:'Winter 2026-27',sportCode:'HOCKEY_ICE',startDate:'2026-11-16',endDate:'2027-03-14',playoffStartDate:'2027-03-01',playoffEndDate:'2027-03-14',timezone:'America/New_York',registrationOpensAt:new Date(Date.now()+60000).toISOString(),registrationClosesAt:'2027-01-15T04:59:59.000Z'},operator);l.seasonId=s.id;persist();}
  for(const name of def.divisions)if(!l.divisions.some(d=>d.name===name)){const d=await api('POST','/league/divisions',{seasonId:l.seasonId,name,genderEligibility:'open',tier:name==='Adult 40+'?'recreational-40':'recreational',regionId:m.regions[def.region],ruleSetOverrides:{maxRosterSize:20,gameRules:RULES,ageRange:{min:name==='Adult 40+'?40:18,max:null,label:name==='Adult 40+'?'40 and over':'Adult 18+'}},playoffConfig:{...kernel.defaultDivisionRules().playoffConfig,enabled:true,playoffSpots:null,overtimeRule:'sudden_death',startDate:'2027-03-01',endDate:'2027-03-14'}},operator);l.divisions.push({id:d.id,name});persist();}
  if(!l.formId){const body={requestId:randomUUID(),registrationType:'both',playerPriceCents:18500,teamFeeEnabled:false,teamPriceCents:0,currency:'USD',requireUsaHockeyId:false,formDefinition:form,publish:true,reviewConfirmed:true};assert.equal(kernel.guidedRegistrationProblem(body),null);const prepared=await api('POST',`/registration-v2/seasons/${l.seasonId}/registration-setup`,body,operator);l.formId=prepared.formId;persist();}
 }
 const teamNames=[['Harbor Hawks','River City Wolves','Northside Bears','Lakeside Falcons'],['Maple Grove Legends','Cedar Valley Eagles','Oak Hill Rangers','Riverside Veterans'],['Metro Mavericks','Brookfield Lynx','Westfield Comets','Summit Storm'],['Coastal Breakers','Bayview Orcas','Seaside Mariners','Cliffside Titans']];
 let divisionIndex=0;
 for(const l of m.leagues)for(const d of l.divisions){
  const names=teamNames[divisionIndex++];
  for(let i=0;i<names.length;i++){
   const name=names[i];let team=m.teams.find(t=>t.name===name);
   const captain=divisionIndex===1&&i===0?m.accounts.captain:await account('captain_'+name.toLowerCase().replaceAll(' ','_'),`${firstNames[(m.teams.length*3+4)%40]} ${lastNames[(m.teams.length+3)%20]}`,['captain'],'team');
   if(!team){const t=await api('POST','/league/teams',{orgId:m.orgId,name,sportCode:'HOCKEY_ICE',shortName:name.split(' ').map(w=>w[0]).join(''),colors:{primary:['#173b66','#963e42','#24594a','#744694'][i]},captainUserId:captain.userId,confirmationThresholdCents:0},root);team={id:t.id,name,seasonId:l.seasonId,divisionId:d.id,captainKey:captain.key,people:[]};m.teams.push(team);persist();}
   const [entry]=await sql`select id from division_team_entries where division_id=${d.id} and team_id=${team.id}`;
   if(!entry)await sql`insert into division_team_entries(division_id,team_id,entry_status) values(${d.id},${team.id},'confirmed')`;
   await grant(captain,'captain','team',team.id);
   const roster=[{id:captain.personId,name:captain.name}];
   if(team.name==='Harbor Hawks')roster.push({id:m.accounts.player.personId,name:m.accounts.player.name});
   if(team.name==='Metro Mavericks')roster.push({id:m.accounts.regional_player.personId,name:m.accounts.regional_player.name});
   while(roster.length<5){const j=m.teams.indexOf(team)*5+roster.length;const name=`${firstNames[j%40]} ${lastNames[Math.floor(j/4)%20]}`;let p=team.people.find(p=>p.slot===roster.length);if(!p){const [person]=await sql`insert into persons(legal_first_name,legal_last_name,dob_date,country_code,metadata) values(${name.split(' ')[0]},${name.split(' ').slice(1).join(' ')},'1980-03-03','US',jsonb_build_object('pphlFinalTesting',${marker}::text)) returning id`;p={id:person.id,name,slot:roster.length};team.people.push(p);persist();}roster.push(p);}
   for(let j=0;j<roster.length;j++){const p=roster[j];const [member]=await sql`select id from team_memberships where team_id=${team.id} and person_id=${p.id} and season_id=${l.seasonId} and effective_to is null`;if(!member)await api('POST','/roster/moves/add',{teamId:team.id,personId:p.id,seasonId:l.seasonId,jerseyNumber:j+1,positionCode:j===4?'G':'C'},operator);}
   team.roster=roster;persist();
  }
 }
 const first=m.leagues[0],team=m.teams[0];
 for(const [key,scope,id] of [['league_admin','league',first.id],['season_admin','season',first.seasonId],['division_admin','division',first.divisions[0].id],['registrar','season',first.seasonId],['scorekeeper','season',first.seasonId],['referee','season',first.seasonId],['coach','team',team.id],['player','team',team.id]])await grant(m.accounts[key],key,scope,id);
 await grant(m.accounts.regional_player,'player','team',m.teams.find(t=>t.name==='Metro Mavericks').id);
 for(const [name,region] of [['Harbor Ice Centre','north'],['Riverside Ice Arena','north'],['Coastal Ice Pavilion','south']]){
  if(m.venues.some(v=>v.name===name))continue;
  const v=await api('POST','/scheduling/venues',{orgId:m.orgId,name,timezone:'America/New_York'},operator);const s=await api('POST',`/scheduling/venues/${v.id}/surfaces`,{label:'Main ice'},operator);m.venues.push({id:v.id,name,surfaceId:s.id,region});persist();
 }
 for(const [i,l] of m.leagues.entries())if(!l.slotsSeeded){const v=m.venues[i];for(const startLocalTime of ['19:00','20:30'])await api('POST',`/scheduling/surfaces/${v.surfaceId}/ice-slots/bulk`,{seasonId:l.seasonId,startDate:'2026-11-16',endDate:'2027-02-28',weekdays:[i===1?0:1],startLocalTime,durationMin:75},operator);l.slotsSeeded=true;persist();}
 m.stage='seeded';m.seededAt=new Date().toISOString();persist();console.log(`Prepared ${m.leagues.length} leagues, ${m.leagues.flatMap(l=>l.divisions).length} divisions, ${m.teams.length} teams and ${Object.keys(m.accounts).length} role/persona accounts.`);
} finally {await sql.end({timeout:5});}
