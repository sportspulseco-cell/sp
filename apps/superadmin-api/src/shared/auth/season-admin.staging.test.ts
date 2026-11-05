import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {createDb,type Database} from '@sportspulse/db';
import {loadAdminScope} from './scope';
import {visibleSeasonIds,visibleFormsWhere,personVisible} from './visibility';
import {DrizzleSeasonRepository} from '../../modules/league-management/infrastructure/repositories/drizzle-season.repository';
import {GetSeasonHandler,ListSeasonsHandler} from '../../modules/league-management/application/seasons/handlers';
import {DrizzleDivisionRepository} from '../../modules/league-management/infrastructure/repositories/drizzle-division.repository';
import {ListDivisionsHandler,GetDivisionHandler} from '../../modules/league-management/application/divisions/handlers';
import {DivisionsController} from '../../modules/league-management/interface/divisions.controller';
import {SchedulingInventoryController} from '../../modules/scheduling-inventory/interface/scheduling-inventory.controller';

test('season, registrar and division grants keep sibling seasons, divisions and people private while preserving owned access',{
 skip:process.env.PPHL_STAGING_DB_TEST!=='1',timeout:120000,
},async()=>{
 process.loadEnvFile('.env.local');assert.equal(process.env.STAGING_SUPABASE_REF,'panwqcxwtugfqekxnqsr');
 const db=createDb({url:`postgresql://postgres.${process.env.STAGING_SUPABASE_REF}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`,max:1,idleTimeout:1});
 const rollback=new Error('UAT access fixtures rolled back');
 await assert.rejects(db.transaction(async tx=>{
  const connection=tx as unknown as Database;
  const [season]=await tx.execute(sql`select s.id,s.org_id,s.league_id from seasons s join leagues l on l.id=s.league_id
   join orgs o on o.id=s.org_id where o.slug='pphl-final-testing' and l.name='North Metro Weeknight Hockey' limit 1`);assert.ok(season);
  const peerId=randomUUID();
  await tx.execute(sql`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s)||jsonb_build_object('id',${peerId}::text,'name','Sibling season access canary'))).* from seasons s where s.id=${season.id}::uuid`);
  const [ownPlayer]=await tx.execute(sql`select id from persons where user_id=(select id from auth.users where email='pphl.final+player@sportspulse.us')`);
  const [foreignPlayer]=await tx.execute(sql`select id from persons where user_id=(select id from auth.users where email='pphl.final+regional-player@sportspulse.us')`);
  for(const role of ['season-admin','registrar']){
   const [actor]=await tx.execute(sql`select id from auth.users where email=${`pphl.final+${role}@sportspulse.us`}`);assert.ok(actor);
   const scope=await loadAdminScope(connection,String(actor.id));
   assert.deepEqual(scope.seasonIds,[season.id]);assert.deepEqual(scope.orgIds,[]);assert.deepEqual(scope.leagueIds,[]);
   const filters={leagueIdsFilter:scope.leagueIds??undefined,orgIdsFilter:scope.orgWideOrgIds??undefined,seasonIdsFilter:scope.seasonIds??undefined};
   const repo=new DrizzleSeasonRepository(connection);
   const page=await new ListSeasonsHandler(repo).execute({...filters,limit:100});assert.deepEqual(page.items.map(s=>s.id),[season.id]);
   assert.equal((await new GetSeasonHandler(repo).execute({...filters,id:String(season.id)})).id,season.id);
   await assert.rejects(new GetSeasonHandler(repo).execute({...filters,id:peerId}),/not found/i);
   const visible=await tx.execute(sql`select id from seasons where id in ${visibleSeasonIds(scope)!}`);assert.deepEqual(visible.map(r=>r.id),[season.id]);
   const forms=await tx.execute(sql`select season_id from registration_forms where ${visibleFormsWhere(scope)!}`);assert.ok(forms.length);assert.ok(forms.every(f=>f.season_id===season.id));
   const divisions=await new ListDivisionsHandler(new DrizzleDivisionRepository(connection)).execute({...filters,limit:100});assert.equal(divisions.items.length,2);
   assert.ok(divisions.items.every(d=>d.seasonId===season.id));
   assert.equal(await personVisible(connection,{scope,userId:String(actor.id)},String(ownPlayer!.id)),true);
   assert.equal(await personVisible(connection,{scope,userId:String(actor.id)},String(foreignPlayer!.id)),false);
   const inventory=new SchedulingInventoryController(connection) as any;
   await inventory.requireSeason({userId:String(actor.id)},season.id,'read');
   await assert.rejects(inventory.requireSeason({userId:String(actor.id)},peerId,'read'),/Season not found/);
   if(role==='season-admin')await inventory.requireSeason({userId:String(actor.id)},season.id,'write');
   else await assert.rejects(inventory.requireSeason({userId:String(actor.id)},season.id,'write'),/cannot change/);
  }
  const [divisionActor]=await tx.execute(sql`select id from auth.users where email='pphl.final+division-admin@sportspulse.us'`);
  const divisionScope=await loadAdminScope(connection,String(divisionActor!.id));
  assert.deepEqual(divisionScope.orgIds,[]);assert.deepEqual(divisionScope.leagueIds,[]);assert.equal(divisionScope.divisionIds?.length,1);assert.deepEqual(divisionScope.parentSeasonIds,[season.id]);
  const divisionRepo=new DrizzleDivisionRepository(connection),divisionFilters={leagueIdsFilter:[],orgIdsFilter:[],divisionIdsFilter:divisionScope.divisionIds};
  const divisionPage=await new ListDivisionsHandler(divisionRepo).execute({...divisionFilters,limit:100});assert.deepEqual(divisionPage.items.map(d=>d.id),divisionScope.divisionIds);
  const [siblingDivision]=await tx.execute(sql`select id from divisions where season_id=${season.id}::uuid and id<>${divisionScope.divisionIds![0]}::uuid limit 1`);assert.ok(siblingDivision);
  await assert.rejects(new GetDivisionHandler(divisionRepo).execute({...divisionFilters,id:String(siblingDivision.id)}),/not found/i);
  assert.equal(await personVisible(connection,{scope:divisionScope,userId:String(divisionActor!.id)},String(ownPlayer!.id)),true);
  assert.equal(await personVisible(connection,{scope:divisionScope,userId:String(divisionActor!.id)},String(foreignPlayer!.id)),false);
  const [siblingPerson]=await tx.execute(sql`select tm.person_id from team_memberships tm join division_team_entries e on e.team_id=tm.team_id where tm.season_id=${season.id}::uuid and e.division_id=${siblingDivision.id}::uuid limit 1`);assert.ok(siblingPerson);
  assert.equal(await personVisible(connection,{scope:divisionScope,userId:String(divisionActor!.id)},String(siblingPerson.person_id)),false);
  const controller=new DivisionsController(null as any,null as any,null as any,null as any,null as any,connection) as any;
  await controller.requireWrite(String(divisionActor!.id),String(season.id),divisionScope.divisionIds![0],'division.update');
  await assert.rejects(controller.requireWrite(String(divisionActor!.id),String(season.id),String(siblingDivision.id),'division.update'),/not found/i);
  await assert.rejects(controller.requireWrite(String(divisionActor!.id),String(season.id),null,'division.create'),/not found/i);
  throw rollback;
 }),error=>error===rollback);
});
