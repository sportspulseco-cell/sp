"use client";
import {useEffect,useState} from "react";
import {Button,Field,Input} from "@sportspulse/ui";
import {zonedWallTimeToUtc} from "@sportspulse/kernel";
import {gameOps} from "@/lib/api/browser-api";
type Period={startTsUtc:string;endTsUtc:string};
export function OfficialAvailability({timezone}:{timezone:string}) {
 const [periods,setPeriods]=useState<Period[]>([]);const [loaded,setLoaded]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [start,setStart]=useState("");const [end,setEnd]=useState("");
 async function load(){setError("");try{setPeriods((await gameOps.myOfficialAvailability()).periods);setLoaded(true);}catch(e){setError(e instanceof Error?e.message:"Availability could not load.");}}
 useEffect(()=>{void load();},[]);
 async function save(next:Period[]){setBusy(true);setError("");try{setPeriods((await gameOps.saveOfficialAvailability(next)).periods);setStart("");setEnd("");}catch(e){setError(e instanceof Error?e.message:"Availability could not save. Try again.");}finally{setBusy(false);}}
 return <details className="rounded-lg border border-border bg-surface-1 p-4">
  <summary className="cursor-pointer text-sm font-medium">My unavailable times</summary>
  <div className="mt-4 space-y-4"><p className="text-sm text-fg-muted">The assigner sees a warning for games during these times. Dates use {timezone}.</p>
   {!loaded && !error?<p role="status" className="text-sm">Loading availability...</p>:null}
   {error?<div role="alert" className="text-sm">{error}{!loaded?<Button size="sm" variant="ghost" onClick={()=>void load()}>Retry</Button>:null}</div>:null}
   {loaded?<><div className="grid gap-4 sm:grid-cols-2"><Field label="Unavailable from"><Input type="datetime-local" value={start} disabled={busy} onChange={e=>setStart(e.target.value)}/></Field><Field label="Unavailable until"><Input type="datetime-local" value={end} disabled={busy} onChange={e=>setEnd(e.target.value)}/></Field></div>
    <Button disabled={busy || !start || !end || periods.length>=100} onClick={()=>{try{const a=zonedWallTimeToUtc(start,timezone).toISOString();const b=zonedWallTimeToUtc(end,timezone).toISOString();if(a>=b)throw new Error("End must be after start.");void save([...periods,{startTsUtc:a,endTsUtc:b}]);}catch(e){setError(e instanceof Error?e.message:"Check the dates.");}}}>{busy?"Saving...":"Add unavailable time"}</Button>
    {!periods.length?<p className="text-sm text-fg-muted">No unavailable periods saved.</p>:<ul className="space-y-2">{periods.map((p,i)=><li key={`${p.startTsUtc}:${i}`} className="flex flex-wrap items-center gap-3 text-sm"><span>{new Date(p.startTsUtc).toLocaleString(undefined,{timeZone:timezone})} - {new Date(p.endTsUtc).toLocaleString(undefined,{timeZone:timezone})}</span><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void save(periods.filter((_,j)=>i!==j))}>Remove</Button></li>)}</ul>}
   </>:null}
  </div>
 </details>;
}
