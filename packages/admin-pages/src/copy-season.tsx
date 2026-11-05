"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {Button,Dialog,DialogActions,Field,Input} from "@sportspulse/ui";
import type {Season} from "@sportspulse/api-client";

export function CopySeasonButton({season,copy,divisionCount}:{
  season:Season;divisionCount:number;
  copy:(id:string,body:{name:string;startDate:string;requestId:string;newLeagueName?:string;copySchedule?:boolean;copyTeamEntries?:boolean})=>Promise<{seasonId:string}>;
}) {
  const router=useRouter();const requestId=useRef(crypto.randomUUID());
  const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const [name,setName]=useState("");const [date,setDate]=useState("");const [league,setLeague]=useState("");
  const [teams,setTeams]=useState(false);const [schedule,setSchedule]=useState(false);
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{const result=await copy(season.id,{name:name.trim(),startDate:date,requestId:requestId.current,newLeagueName:league.trim() || undefined,copyTeamEntries:teams,copySchedule:schedule});router.push(`/seasons/${result.seasonId}`);router.refresh();}
    catch(e){setError(e instanceof Error?e.message:"Copy failed. Retry with the same settings.");setBusy(false);}
  }
  return <>
    <Button variant="secondary" onClick={()=>setOpen(true)}>Copy season</Button>
    <Dialog open={open} onClose={()=>{if(!busy)setOpen(false);}} title="Copy season" description={`Start from ${season.name}. The copy stays in draft until you review and publish it.`}>
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-md border border-border bg-bg-subtle p-3 text-sm text-fg-muted">
          Copies {divisionCount} divisions, rules, pricing, registration questions, waivers and email templates. Dates move by the same number of calendar days. Payments, registrations, player rosters, results and sent messages stay in the original season.
        </div>
        <Field label="New season name"><Input required maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="Spring 2027"/></Field>
        <Field label="New season starts" hint={`Times stay local to ${season.timezone || "UTC"}.`}><Input required type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></Field>
        <details><summary className="cursor-pointer text-sm font-medium">League and schedule options</summary><div className="mt-4 space-y-4">
          <Field label="New league name" hint="Leave blank to keep this season under the existing league."><Input maxLength={120} value={league} disabled={busy} onChange={e=>setLeague(e.target.value)} placeholder="Keep existing league"/></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={teams} onChange={e=>{setTeams(e.target.checked);if(!e.target.checked)setSchedule(false);}}/><span>Include team entries for review. Each entry starts as Applied; no dues or roster is copied.</span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy || !teams} checked={schedule} onChange={e=>setSchedule(e.target.checked)}/><span>Copy regular-season fixtures, ice slots and blackout dates as a draft schedule. Review ice availability before publishing.</span></label>
        </div></details>
        {error ? <p role="alert" className="text-sm text-fg">{error}</p>:null}
        <DialogActions><Button type="button" variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim() || !date}>{busy?"Copying season...":"Create draft copy"}</Button></DialogActions>
      </form>
    </Dialog>
  </>;
}
