"use client";
import { useState } from "react";
import { Button, Field, Input, Select } from "@sportspulse/ui";
import { zonedWallTimeToUtc } from "@sportspulse/kernel";
import type { TeamScheduleConstraints } from "./scheduler-client";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function TeamPreferences({ teams, venues, timezone, value, onChange, disabled }: {
  teams: Record<string,string>; venues: Array<{id:string;name:string}>; timezone:string;
  value: Record<string,TeamScheduleConstraints>; onChange:(value:Record<string,TeamScheduleConstraints>)=>void; disabled:boolean;
}) {
  const [team,setTeam]=useState("");
  const [start,setStart]=useState(""); const [end,setEnd]=useState(""); const [error,setError]=useState("");
  const current=value[team] ?? {};
  const patch=(next:Partial<TeamScheduleConstraints>)=>onChange({...value,[team]:{...current,...next}});
  return <details className="rounded-lg border border-border p-4">
    <summary className="cursor-pointer text-sm font-medium text-fg">Team preferences and unavailable dates</summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm text-fg-muted">Preferred nights and venues guide the schedule. Set an exception limit to make it a hard rule. Dates use {timezone}. Settings are stored with the generated run.</p>
      <Field label="Team"><Select value={team} onChange={e=>{setTeam(e.target.value);setError("");}} disabled={disabled}>
        <option value="">Choose a team</option>{Object.entries(teams).map(([id,name])=><option key={id} value={id}>{name}</option>)}
      </Select></Field>
      {team ? <>
        <fieldset disabled={disabled} className="space-y-2"><legend className="text-sm font-medium">Preferred nights</legend><div className="flex flex-wrap gap-3">
          {DAYS.map((day,i)=><label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={current.preferredWeekdays?.includes(i+1) ?? false} onChange={e=>patch({preferredWeekdays:e.target.checked?[...(current.preferredWeekdays ?? []),i+1]:(current.preferredWeekdays ?? []).filter(d=>d!==i+1)})}/>{day}</label>)}
        </div></fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Maximum off-night games" hint="Blank: prefer these nights; 0: never use another night."><Input type="number" min="0" value={current.maxOffNightGames ?? ""} disabled={disabled || !current.preferredWeekdays?.length} onChange={e=>patch({maxOffNightGames:e.target.value===""?undefined:Number(e.target.value)})}/></Field>
          <Field label="Preferred venue"><Select disabled={disabled} value={current.preferredVenueIds?.[0] ?? ""} onChange={e=>patch({preferredVenueIds:e.target.value?[e.target.value]:[],maxOffVenueGames:undefined})}><option value="">Any venue</option>{venues.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          <Field label="Maximum games at other venues" hint="Blank: prefer this venue; 0: only this venue."><Input type="number" min="0" value={current.maxOffVenueGames ?? ""} disabled={disabled || !current.preferredVenueIds?.length} onChange={e=>patch({maxOffVenueGames:e.target.value===""?undefined:Number(e.target.value)})}/></Field>
        </div>
        <fieldset disabled={disabled} className="space-y-3"><legend className="text-sm font-medium">Unavailable time</legend>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="From"><Input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="Until"><Input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></Field></div>
          <Button type="button" disabled={!start || !end} onClick={()=>{try { const a=zonedWallTimeToUtc(start,timezone).toISOString();const b=zonedWallTimeToUtc(end,timezone).toISOString();if(a>=b)throw new Error("End must be after start.");patch({blackouts:[...(current.blackouts ?? []),{startTsUtc:a,endTsUtc:b}]});setStart("");setEnd("");setError("");}catch(e){setError(e instanceof Error?e.message:"Check the dates.");}}}>Add unavailable time</Button>
          {error ? <p role="alert" className="text-sm text-fg">{error}</p>:null}
          {(current.blackouts ?? []).map((b,i)=><div key={`${b.startTsUtc}:${i}`} className="flex flex-wrap items-center gap-3 text-sm"><span>{new Date(b.startTsUtc).toLocaleString(undefined,{timeZone:timezone})} - {new Date(b.endTsUtc).toLocaleString(undefined,{timeZone:timezone})}</span><button type="button" className="underline" onClick={()=>patch({blackouts:current.blackouts?.filter((_,j)=>j!==i)})}>Remove</button></div>)}
        </fieldset>
      </>:null}
    </div>
  </details>;
}
