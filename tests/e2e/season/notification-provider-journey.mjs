import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {CFG,OUT,TARGET,env,call,login,sql} from './lib.mjs';
import {resendRequest} from './delivery-lib.mjs';
assert.equal(TARGET,'staging');
assert.equal(env.STAGING_SUPABASE_REF,'panwqcxwtugfqekxnqsr');
const ids=[],checks=[];
try {
 const token=await login(CFG.superAdmin.email,CFG.superAdmin.password);
 for(const [address,outcome] of [['bounced@resend.dev','bounced'],['complained@resend.dev','complained'],['unapproved-qa@example.invalid','suppressed']]) {
  const id=randomUUID(); ids.push(id);
  await sql`insert into notifications(id,idempotency_key,template_code,channel,recipient_email,subject,body,payload,source_event)
    values(${id},${'qa-provider-'+id},'schedule.published','email',${address},'SportsPulse staging delivery verification','Synthetic staging notification. No action required.','{}'::jsonb,'qa.delivery.acceptance')`;
  const response=await call('POST',`/notifications/${id}/retry`,undefined,token); assert.equal(response.status,201);
  const until=Date.now()+90000; let row;
  do { [row]=await sql`select status,attempt_count,provider_message_id,delivery_status from notifications where id=${id}`;
   if(outcome==='suppressed'?row.status==='suppressed':row.delivery_status===outcome) break;
   await new Promise(resolve=>setTimeout(resolve,1500));
  } while(Date.now()<until);
  if(outcome==='suppressed') {assert.equal(row.status,'suppressed');assert.equal(row.provider_message_id,null);}
  else {
   assert.equal(row.delivery_status,outcome);
   const provider=await resendRequest(`emails/${row.provider_message_id}`); assert.equal(provider.last_event,outcome);
   assert.equal((await sql`select count(*)::int n from notification_delivery_receipts where notification_id=${id} and delivery_status=${outcome}`)[0].n,1);
  }
  const before=row.provider_message_id;
  await call('POST',`/notifications/${id}/retry`,undefined,token);
  [row]=await sql`select provider_message_id,attempt_count from notifications where id=${id}`;
  assert.equal(row.provider_message_id,before); assert.equal(row.attempt_count,1);
  checks.push({outcome,notificationId:id,providerId:before}); console.log(`PASS actual provider ${outcome}, retry does not resend`);
 }
 writeFileSync(`${OUT}/notification-provider-browser.json`,JSON.stringify({outcome:'passed',checks},null,2));
} finally {
 for(const id of ids) await sql`delete from notifications where id=${id}`;
 await sql.end({timeout:5});
}
