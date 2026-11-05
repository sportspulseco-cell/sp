import assert from "node:assert/strict";
import {test} from "node:test";
import {randomUUID} from "node:crypto";
import type {UserScope} from "../../../../shared/auth/scope";
import {seasonReadFilters} from "./access-filters";
import {GetSeasonHandler,ListSeasonsHandler} from "./handlers";
import {Season} from "../../domain/entities/season.entity";
import {SeasonId} from "../../domain/identifiers";
import type {SeasonRepository} from "../../domain/repositories/season.repository";
const id=randomUUID(),orgId=randomUUID(),leagueId=randomUUID();
const season=Season.create({id:SeasonId.of(id),orgId,leagueId,name:"Spring 2027",sportCode:"HOCKEY_ICE",startDate:"2027-01-02",endDate:"2027-04-30"});
const empty:UserScope={isSuperAdmin:false,orgIds:[],orgWideOrgIds:[],leagueIds:[],teamIds:[]};
const repository={findById:async()=>season,list:async()=>({items:[season],nextCursor:null})} as unknown as SeasonRepository;
const get=(scope:UserScope)=>new GetSeasonHandler(repository).execute({id,...seasonReadFilters(scope)});
test("a profile-flag super admin with no assignments can open a season",async()=>{
 assert.equal((await get({...empty,isSuperAdmin:true,orgIds:null,orgWideOrgIds:null,leagueIds:null,teamIds:null})).id,id);
});
test("platform-wide season reads remain unrestricted",async()=>{
 assert.equal((await get({...empty,orgIds:null,orgWideOrgIds:null,leagueIds:null,teamIds:null})).id,id);
});
test("empty grants remain denied for detail and list",async()=>{
 await assert.rejects(get(empty));
 assert.deepEqual((await new ListSeasonsHandler(repository).execute(seasonReadFilters(empty))).items,[]);
});
test("league and season grants never widen through the parent organization",async()=>{
 assert.equal((await get({...empty,orgIds:[orgId],leagueIds:[leagueId]})).id,id);
 await assert.rejects(get({...empty,orgIds:[orgId],leagueIds:[randomUUID()]}));
 assert.equal((await get({...empty,seasonIds:[id]})).id,id);
 await assert.rejects(get({...empty,seasonIds:[randomUUID()]}));
});
test("division admins retain only their explicit parent season metadata",async()=>{
 assert.equal((await get({...empty,divisionIds:[randomUUID()],parentSeasonIds:[id]})).id,id);
 await assert.rejects(get({...empty,divisionIds:[randomUUID()],parentSeasonIds:[randomUUID()]}));
});
