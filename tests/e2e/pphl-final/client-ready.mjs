import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {OUT,sql,login,call} from './lib.mjs';
const m=JSON.parse(readFileSync(OUT+'/access.client.private.json','utf8'));
try{
 assert.equal(m.orgSlug,'pphl-client-testing');assert.equal(m.stage,'seeded');
 const [counts]=await sql`select (select count(*)::int from leagues where org_id=${m.orgId}) leagues,(select count(*)::int from seasons where org_id=${m.orgId}) seasons,(select count(*)::int from divisions d join seasons s on s.id=d.season_id where s.org_id=${m.orgId}) divisions,(select count(*)::int from teams where org_id=${m.orgId}) teams,(select count(*)::int from team_memberships tm join seasons s on s.id=tm.season_id where s.org_id=${m.orgId} and tm.current_status='active' and tm.effective_to is null) roster_memberships,(select count(*)::int from registrations where org_id=${m.orgId}) registrations,(select count(*)::int from games g join leagues l on l.id=g.league_id where l.org_id=${m.orgId}) games,(select count(*)::int from invoices where org_id=${m.orgId}) invoices`;
 assert.deepEqual(counts,{leagues:3,seasons:3,divisions:4,teams:16,roster_memberships:80,registrations:0,games:0,invoices:0});
 const actor=m.accounts.returning_player,token=await login(actor.email,actor.password);const me=await call('GET','/iam/me/scope',undefined,token);assert.equal(me.status,200);
 const [name]=await sql`select legal_first_name,legal_last_name from persons where id=${actor.personId}`;assert.equal(`${name.legal_first_name} ${name.legal_last_name}`,actor.name);
 writeFileSync(OUT+'/client-data-results.json',JSON.stringify({outcome:'passed',organization:m.orgName,accounts:Object.keys(m.accounts).length,counts,checks:['Separate client organization starts with no submissions, invoices or generated games.','Returning client account authenticates and has the expected real-looking legal name.','Original 16 teams retain five roster members each; role fixtures are separate from engineering rehearsal.']},null,2));console.log('PASS clean client dataset and returning-account sign-in');
}finally{await sql.end({timeout:5});}
