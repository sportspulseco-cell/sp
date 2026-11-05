import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {createDb,type Database} from "@sportspulse/db";
import {DuplicateSeasonService} from "./duplicate-season.service";

test("staging: season copy preserves configuration, resets live state and is replay-safe",{skip:process.env.PPHL_STAGING_DB_TEST!=="1"},async()=>{
  process.loadEnvFile(".env.local");const ref=process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref!=="nmiiqyfwvbcvtwumtwil");
  const db=createDb({url:`postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`,max:1,idleTimeout:1});
  const rollback=new Error("copy fixtures rolled back");let copiedId="";
  await assert.rejects(db.transaction(async tx=>{
    const service=new DuplicateSeasonService(tx as unknown as Database);
    const input={sourceSeasonId:process.env.STAGING_SEASON_ID!,name:`Spring 2098 QA ${randomUUID().slice(0,8)}`,startDate:"2098-01-01",requestId:randomUUID(),copyTeamEntries:true,copySchedule:true};
    const source=await tx.execute(sql`select to_jsonb(s) body from seasons s where id=${input.sourceSeasonId}::uuid`);
    const result=await service.execute(input,process.env.STAGING_SUPERADMIN_ID!);copiedId=result.seasonId;
    const replay=await service.execute(input,process.env.STAGING_SUPERADMIN_ID!);
    assert.equal(replay.seasonId,result.seasonId);assert.equal(replay.replayed,true);
    await assert.rejects(service.execute({...input,name:"Different request"},process.env.STAGING_SUPERADMIN_ID!),/different settings/);
    const [copy]=await tx.execute(sql`select status,start_date from seasons where id=${copiedId}::uuid`);
    assert.ok(copy);
    assert.equal(copy.status,"draft");assert.equal(String(copy.start_date).slice(0,10),"2098-01-01");
    const [originalCount]=await tx.execute(sql`select count(*)::int n from divisions where season_id=${input.sourceSeasonId}::uuid and deleted_at is null`);
    const [copiedCount]=await tx.execute(sql`select count(*)::int n from divisions where season_id=${copiedId}::uuid and deleted_at is null`);
    assert.ok(originalCount && copiedCount);
    assert.ok(Number(originalCount.n)>0,"Representative source divisions are required");assert.equal(copiedCount.n,originalCount.n);
    const dirty=await tx.execute(sql`select id from games where season_id=${copiedId}::uuid and (published_at is not null or home_score<>0 or away_score<>0 or status<>'scheduled' or finalized_at is not null)`);
    assert.equal(dirty.length,0);
    const paid=await tx.execute(sql`select id from division_team_entries where division_id in (select id from divisions where season_id=${copiedId}::uuid) and (invoice_id is not null or carry_standings=true or entry_status<>'applied')`);
    assert.equal(paid.length,0);
    const changed=await tx.execute(sql`select to_jsonb(s) body from seasons s where id=${input.sourceSeasonId}::uuid`);
    assert.deepEqual(changed,source);
    throw rollback;
  }),e=>e===rollback);
  if(copiedId)assert.equal((await db.execute(sql`select id from seasons where id=${copiedId}::uuid`)).length,0);
});
