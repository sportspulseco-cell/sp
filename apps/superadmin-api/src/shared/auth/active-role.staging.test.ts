import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {createDb,type Database} from "@sportspulse/db";
import {loadAdminScope} from "./scope";
test("staging authorization excludes expired/future roles while allowing a current grant",{skip:process.env.PPHL_STAGING_DB_TEST!=="1"},async()=>{
 process.loadEnvFile(".env.local");const ref=process.env.STAGING_SUPABASE_REF;assert.ok(ref && ref!=="nmiiqyfwvbcvtwumtwil");
 const db=createDb({url:`postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`,max:1,idleTimeout:1});
 const rollback=new Error("authorization fixtures rolled back");
 await assert.rejects(db.transaction(async tx=>{
  const orgs=[randomUUID(),randomUUID(),randomUUID()];const actor=process.env.STAGING_PLAYER_ID!;
  for(let i=0;i<orgs.length;i++){
   const id=orgs[i]!;
   await tx.execute(sql`insert into orgs select (jsonb_populate_record(null::orgs,to_jsonb(o) || jsonb_build_object('id',${id}::text,'slug',${`authorization-qa-${id}`}::text,'legal_name',${`QA Access ${id}`}::text))).* from orgs o where id=${process.env.STAGING_ORG_ENTITY_ID}::uuid`);
   const start=new Date(Date.now()+(i===0?86400000:-172800000));const end=new Date(Date.now()+(i===1?-86400000:172800000));
   await tx.execute(sql`insert into user_role_assignments (user_id,role_id,scope_type,scope_id,effective_from,effective_to)
     select ${actor}::uuid,r.id,'org',${id}::uuid,${start.toISOString()}::timestamptz,${end.toISOString()}::timestamptz from roles r where r.code='org_admin' and r.is_system=true limit 1`);
  }
  const scope=await loadAdminScope(tx as unknown as Database,actor);
  assert.notEqual(scope.orgIds,null,"The fixture actor is not a platform administrator");
  assert.equal(scope.orgIds!.includes(orgs[0]!),false);assert.equal(scope.orgIds!.includes(orgs[1]!),false);assert.equal(scope.orgIds!.includes(orgs[2]!),true);
  throw rollback;
 }),e=>e===rollback);
});
