import assert from 'node:assert/strict';
import {auth,sql,loadManifest} from './lib.mjs';
const m=loadManifest();
try{for(const a of Object.values(m.accounts)){
 const first=a.name.split(' ')[0],last=a.name.split(' ').slice(1).join(' ');
 const {data,error}=await auth.auth.admin.getUserById(a.userId);assert.ok(!error);assert.equal(data.user.app_metadata.pphl_final_testing,'pphl-final-2026-11-05');
 const updated=await auth.auth.admin.updateUserById(a.userId,{user_metadata:{full_name:a.name,display_name:a.name,first_name:first,last_name:last}});assert.ok(!updated.error);
 await sql`update persons set legal_first_name=${first},legal_last_name=${last} where id=${a.personId}`;
 }
 // Rehearsal draft has no signatures; repair the stored signup name before signing.
 const a=m.accounts.returning_player;
 await sql`update registrations set metadata=metadata||jsonb_build_object('fullName',${a.name}::text) where subject_person_id=${a.personId} and season_id=${m.leagues[0].seasonId} and status not in ('approved','rejected','cancelled','withdrawn')`;
 console.log('Repaired owned fixture identity metadata and unsigned returning-player draft.');
}finally{await sql.end({timeout:5});}
