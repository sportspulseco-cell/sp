import { Inject, Injectable } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";
import { ConflictError, NotFoundError, ValidationError, utcToZonedWallTime, zonedWallTimeToUtc } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { accessCan, accessForAnyScope } from "../../../shared/auth/game-access";
import { ADMIN_SCOPE_ROLE_CODES } from "../../../shared/auth/scope";

export interface DuplicateSeasonInput {
  sourceSeasonId:string; name:string; startDate:string; requestId:string;
  newLeagueName?:string; copySchedule?:boolean; copyTeamEntries?:boolean;
}

export function shiftCalendarDay(value:string,days:number):string {
  const date=new Date(`${value}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value)throw new ValidationError("Choose a real start date.");
  date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
export function shiftSeasonInstant(value:Date|null,days:number,zone:string):Date|null {
  if(!value)return null;
  const local=utcToZonedWallTime(value,zone);
  const shiftedLocal=`${shiftCalendarDay(local.slice(0,10),days)}${local.slice(10)}`;
  const shifted=zonedWallTimeToUtc(shiftedLocal,zone);
  if(utcToZonedWallTime(shifted,zone)!==shiftedLocal)throw new ValidationError("A copied time falls inside a daylight-saving clock change. Choose another start date or adjust the source time.");
  return new Date(shifted.getTime()+value.getUTCSeconds()*1000+value.getUTCMilliseconds());
}
async function batches<T>(rows:T[],write:(chunk:T[])=>PromiseLike<unknown>):Promise<void> {
  for(let i=0;i<rows.length;i+=100)await write(rows.slice(i,i+100));
}

@Injectable()
export class DuplicateSeasonService {
  constructor(@Inject(DRIZZLE) private readonly db:Database){}

  async execute(input:DuplicateSeasonInput,userId:string) {
    const name=input.name.trim();
    if(!name || name.length>120)throw new ValidationError("Use a season name between 1 and 120 characters.");
    shiftCalendarDay(input.startDate,0);
    if(input.copySchedule && !input.copyTeamEntries)throw new ValidationError("Copy the team entries when copying their schedule. Rosters and payments are never copied.");
    const fingerprint=createHash("sha256").update(JSON.stringify({source:input.sourceSeasonId,name,start:input.startDate,league:input.newLeagueName?.trim() || null,schedule:!!input.copySchedule,teams:!!input.copyTeamEntries})).digest("hex");
    return this.db.transaction(async tx=>{
      for(const key of [`season-copy-request:${input.requestId}`,`season-copy-input:${fingerprint}`].sort())await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const [source]=await tx.select().from(schema.seasons).where(and(eq(schema.seasons.id,input.sourceSeasonId),isNull(schema.seasons.deletedAt))).limit(1);
      if(!source)throw new NotFoundError("Season",input.sourceSeasonId);
      const destination = { id:"", orgId:source.orgId, leagueId:input.newLeagueName?.trim() ? "" : source.leagueId,
        seasonId:null, divisionId:null, homeTeamId:"", awayTeamId:"" };
      const access = await accessForAnyScope(tx as unknown as Database,userId,[destination],ADMIN_SCOPE_ROLE_CODES);
      if(!accessCan(access,input.newLeagueName?.trim() ? "league.create" : "season.create"))
        throw new NotFoundError("Season",input.sourceSeasonId);
      const [existing]=await tx.select().from(schema.seasons).where(and(eq(schema.seasons.orgId,source.orgId),isNull(schema.seasons.deletedAt),or(sql`${schema.seasons.metadata}->>'copyRequestId' = ${input.requestId}`,sql`${schema.seasons.metadata}->>'copyFingerprint' = ${fingerprint}`))).limit(1);
      if(existing){
        const metadata=existing.metadata as Record<string,unknown>;
        if(metadata.copyFingerprint!==fingerprint)throw new ConflictError("This copy request was already used with different settings. Start a new copy.");
        return {seasonId:existing.id,leagueId:existing.leagueId,replayed:true};
      }
      const days=Math.round((Date.parse(`${input.startDate}T00:00:00Z`)-Date.parse(`${source.startDate}T00:00:00Z`))/86400000);
      const zone=source.timezone || "UTC";const now=new Date();
      const day=(v:string|null)=>v?shiftCalendarDay(v,days):null;
      const instant=(v:Date|null,tz=zone)=>shiftSeasonInstant(v,days,tz);
      let leagueId=source.leagueId;
      if(input.newLeagueName?.trim()){
        const leagueName=input.newLeagueName.trim();
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`league-name:${source.orgId}:${leagueName.toLowerCase()}`}))`);
        const [clash]=await tx.select({id:schema.leagues.id}).from(schema.leagues).where(and(eq(schema.leagues.orgId,source.orgId),isNull(schema.leagues.deletedAt),sql`${schema.leagues.status} <> 'archived' and lower(btrim(${schema.leagues.name})) = lower(btrim(${leagueName}))`)).limit(1);
        if(clash)throw new ConflictError("A live league already uses that name. Choose another name for the copy.");
        const [league]=await tx.select().from(schema.leagues).where(eq(schema.leagues.id,source.leagueId)).limit(1);
        if(!league)throw new NotFoundError("League",source.leagueId);
        leagueId=randomUUID();
        await tx.insert(schema.leagues).values({...league,id:leagueId,name:input.newLeagueName.trim(),status:"draft",deletedAt:null,createdAt:now,updatedAt:now,
          metadata:{...(league.metadata as Record<string,unknown>),slug:input.newLeagueName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),copiedFrom:league.id}});
      }
      const seasonId=randomUUID();
      const [duplicateName]=await tx.select({id:schema.seasons.id}).from(schema.seasons).where(and(eq(schema.seasons.leagueId,leagueId),eq(schema.seasons.name,name),isNull(schema.seasons.deletedAt))).limit(1);
      if(duplicateName)throw new ConflictError("That league already has a season with this name.");
      const { guidedRegistrationSetup: _sourceSetup, ...copyMetadata } = source.metadata as Record<string, unknown>;
      await tx.insert(schema.seasons).values({...source,id:seasonId,leagueId,name,status:"draft",startDate:input.startDate,endDate:day(source.endDate)!,
        playoffStartDate:day(source.playoffStartDate),playoffEndDate:day(source.playoffEndDate),registrationOpensAt:instant(source.registrationOpensAt),
        registrationClosesAt:instant(source.registrationClosesAt),rosterLockAt:instant(source.rosterLockAt),lastLockSweepAt:null,deletedAt:null,createdAt:now,updatedAt:now,createdByUserId:userId,
        metadata:{...copyMetadata,slug:name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),copiedFrom:source.id,copyRequestId:input.requestId,copyFingerprint:fingerprint}});
      const divisions=await tx.select().from(schema.divisions).where(and(eq(schema.divisions.seasonId,source.id),isNull(schema.divisions.deletedAt)));
      const divisionIds=new Map(divisions.map(d=>[d.id,randomUUID()]));
      const divisionRows=divisions.map(d=>{
        const playoffs={...(d.playoffConfig as Record<string,unknown>)};
        for(const key of ["startDate","endDate"])if(typeof playoffs[key]==="string" && playoffs[key])playoffs[key]=day(playoffs[key] as string);
        return {...d,id:divisionIds.get(d.id)!,seasonId,playoffConfig:playoffs,deletedAt:null,createdAt:now,updatedAt:now};
      });
      await batches(divisionRows,rows=>tx.insert(schema.divisions).values(rows));
      const tiers=await tx.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.seasonId,source.id));
      const tierIds=new Map(tiers.map(t=>[t.id,randomUUID()]));
      await batches(tiers.map(t=>({...t,id:tierIds.get(t.id)!,seasonId,divisionId:t.divisionId?divisionIds.get(t.divisionId) ?? null:null,usageCount:0,createdAt:now,updatedAt:now})),rows=>tx.insert(schema.pricingTiers).values(rows));
      if(tiers.length){
        const assignments=await tx.select().from(schema.pricingTierDivisions).where(inArray(schema.pricingTierDivisions.pricingTierId,tiers.map(t=>t.id)));
        await batches(assignments.filter(a=>divisionIds.has(a.divisionId)).map(a=>({...a,id:randomUUID(),pricingTierId:tierIds.get(a.pricingTierId)!,divisionId:divisionIds.get(a.divisionId)!,createdAt:now})),rows=>tx.insert(schema.pricingTierDivisions).values(rows));
      }
      const templates=await tx.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.seasonId,source.id));
      await batches(templates.map(t=>({...t,id:randomUUID(),seasonId,attachmentPath:null,createdAt:now,updatedAt:now})),rows=>tx.insert(schema.emailTemplates).values(rows));
      const forms=await tx.select().from(schema.registrationForms).where(and(eq(schema.registrationForms.seasonId,source.id),isNull(schema.registrationForms.deletedAt)));
      const references=new Map<string,string>([[source.id,seasonId],[source.leagueId,leagueId],...divisionIds,...tierIds]);
      const remap=(v:unknown):unknown=>typeof v==="string"?(references.get(v) ?? v):Array.isArray(v)?v.map(remap):v && typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,val])=>[k,remap(val)])):v;
      for(const f of forms){
        const formId=randomUUID();
        references.set(f.id,formId);
        await tx.insert(schema.registrationForms).values({...f,id:formId,seasonId,name:f.name,scopeId:f.scopeId?(references.get(f.scopeId) ?? f.scopeId):null,activeVersionId:null,deletedAt:null,createdAt:now,updatedAt:now});
        const versions=await tx.select().from(schema.registrationFormVersions).where(eq(schema.registrationFormVersions.formId,f.id));
        const version=versions.find(v=>v.id===f.activeVersionId) ?? versions.sort((a,b)=>b.versionNumber-a.versionNumber)[0];
        if(version){const versionId=randomUUID();references.set(version.id,versionId);await tx.insert(schema.registrationFormVersions).values({...version,id:versionId,formId,versionNumber:1,schema:remap(version.schema) as Record<string,unknown>,publishedAt:null,locked:false,createdAt:now});}
      }
      await tx.update(schema.seasons).set({config:remap(source.config) as Record<string,unknown>}).where(eq(schema.seasons.id,seasonId));
      let entriesCopied=0,gamesCopied=0;
      if(input.copyTeamEntries && divisions.length){
        const entries=await tx.select().from(schema.divisionTeamEntries).where(and(inArray(schema.divisionTeamEntries.divisionId,divisions.map(d=>d.id)),inArray(schema.divisionTeamEntries.entryStatus,["applied","pending_approval","accepted","confirmed"])));
        await batches(entries.map(e=>({divisionId:divisionIds.get(e.divisionId)!,teamId:e.teamId,entryStatus:"applied",joinedAt:now,createdAt:now,metadata:{copiedFrom:e.id},previousEntryId:e.id,movementKind:"rollover",carryStandings:false})),rows=>tx.insert(schema.divisionTeamEntries).values(rows));entriesCopied=entries.length;
      }
      if(input.copySchedule){
        const slots=await tx.select().from(schema.iceSlots).where(eq(schema.iceSlots.seasonId,source.id));
        const slotIds=new Map(slots.map(s=>[s.id,randomUUID()]));
        await batches(slots.map(s=>({...s,id:slotIds.get(s.id)!,seasonId,startTsUtc:instant(s.startTsUtc,s.tz || zone)!,status:"available",createdAt:now,updatedAt:now})),rows=>tx.insert(schema.iceSlots).values(rows));
        const blackouts=await tx.select().from(schema.scheduleBlackouts).where(eq(schema.scheduleBlackouts.seasonId,source.id));
        await batches(blackouts.map(b=>({...b,id:randomUUID(),seasonId,startDate:day(b.startDate)!,endDate:day(b.endDate)!,createdByUserId:userId,createdAt:now})),rows=>tx.insert(schema.scheduleBlackouts).values(rows));
        const games=await tx.select().from(schema.games).where(and(eq(schema.games.seasonId,source.id),eq(schema.games.gameType,"regular"),sql`${schema.games.status} not in ('cancelled','postponed')`));
        const gameRows=games.filter(g=>g.divisionId && divisionIds.has(g.divisionId)).map(g=>{
          return {...g,id:randomUUID(),leagueId,seasonId,divisionId:divisionIds.get(g.divisionId!)!,slotId:g.slotId?slotIds.get(g.slotId) ?? null:null,
            scheduleRunId:null,scheduledStartTsUtc:instant(g.scheduledStartTsUtc,g.tz || zone)!,publishedAt:null,lockedAt:null,lockedByUserId:null,status:"scheduled",source:"manual_import",
            homeScore:0,awayScore:0,period:0,finalizedAt:null,finalizedByUserId:null,metadata:{copiedFrom:g.id,templateOnly:true},createdAt:now,updatedAt:now};});
        await batches(gameRows,rows=>tx.insert(schema.games).values(rows));gamesCopied=gameRows.length;
      }
      return {seasonId,leagueId,replayed:false,copied:{divisions:divisions.length,prices:tiers.length,forms:forms.length,templates:templates.length,teamEntries:entriesCopied,games:gamesCopied}};
    });
  }
}
