"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {Season} from "@sportspulse/api-client";
import {Button,Dialog,DialogActions,Field,Input} from "@sportspulse/ui";

type WorkItem={sourceId:string;requestId:string;seasonId?:string;error?:string};
type Work={name:string;startDate:string;items:WorkItem[]};
export function BulkCopySeasonsButton({seasons,leagueNames,actorId,copy}:{
 seasons:Season[];leagueNames:Record<string,string>;actorId:string;
 copy:(sourceId:string,body:{name:string;startDate:string;requestId:string})=>Promise<{seasonId:string}>;
}){
 const router=useRouter();const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<string[]>([]);const [name,setName]=useState("");const [startDate,setStartDate]=useState("");const [search,setSearch]=useState("");
 const [work,setWork]=useState<Work|null>(null);const [error,setError]=useState("");const pause=useRef(false);
 const storageKey=`sp-season-copy:${actorId}`;
 const save=(next:Work)=>{setWork({...next,items:[...next.items]});try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{setError("Browser storage is unavailable. Keep this page open to retain progress; retries still do not duplicate matching copies.");}};
 function show(){
  setOpen(true);setError("");
  try{const saved=JSON.parse(localStorage.getItem(storageKey) ?? "null");
   if(saved && typeof saved.name==="string" && typeof saved.startDate==="string" && Array.isArray(saved.items)){
    const allowed=new Set(seasons.map(s=>s.id));
    const items=saved.items.filter((i:WorkItem)=>allowed.has(i.sourceId) && typeof i.requestId==="string").slice(0,70);
    if(items.length)setWork({name:saved.name,startDate:saved.startDate,items});
   }
  }catch{setError("The saved copy plan could not be read. Start a new plan below.");}
 }
 async function run(next:Work){
  pause.current=false;setBusy(true);setError("");save(next);
  try{
   for(let i=0;i<next.items.length;i++){
    if(pause.current)break;
    const item=next.items[i]!;if(item.seasonId)continue;
    try{const result=await copy(item.sourceId,{name:next.name,startDate:next.startDate,requestId:item.requestId});next.items[i]={...item,seasonId:result.seasonId,error:undefined};}
    catch(e){next.items[i]={...item,error:e instanceof Error?e.message:"Copy failed. Retry this item."};}
    save(next);
   }
  }finally{setBusy(false);router.refresh();}
 }
 const done=work?.items.filter(i=>i.seasonId).length ?? 0;
 const visible=seasons.filter(s=>`${s.name} ${leagueNames[s.leagueId] ?? ""}`.toLowerCase().includes(search.toLowerCase()));
 return <>
  <Button variant="secondary" disabled={!actorId || !seasons.length} onClick={show}>Roll forward leagues</Button>
  <Dialog size="lg" open={open} onClose={()=>{if(!busy)setOpen(false);}} title="Roll forward leagues" description="Copy up to 70 seasons into reviewed drafts. Each copy is saved independently, so you can pause and resume without restarting.">
   {work ? <div className="space-y-4">
    <p className="text-sm font-medium" role="status">{done} of {work.items.length} copied for {work.name}.</p>
    <p className="text-sm text-fg-muted">New start date: {work.startDate}. Divisions, pricing, form questions, waivers and email templates are copied. Teams, schedules, payments and registrations are excluded from this bulk action.</p>
    <ul className="max-h-72 space-y-3 overflow-auto">{work.items.map(i=>{const s=seasons.find(s=>s.id===i.sourceId);return <li key={i.requestId} className="rounded-md border border-border p-3 text-sm"><span className="font-medium">{s ? `${leagueNames[s.leagueId] ?? "League"} / ${s.name}`:"Source season"}</span><p className="mt-1 text-fg-muted">{i.seasonId?"Draft copy ready":i.error ?? (busy?"Waiting for its turn":"Ready to copy")}</p></li>;})}</ul>
    {error?<p role="alert" className="text-sm">{error}</p>:null}
    <DialogActions>{busy?<Button variant="secondary" onClick={()=>{pause.current=true;}}>Pause after current copy</Button>:<><Button variant="ghost" onClick={()=>{localStorage.removeItem(storageKey);setWork(null);setSelected([]);}}>New plan</Button><Button disabled={done===work.items.length} onClick={()=>void run({...work,items:[...work.items]})}>{done===work.items.length?"All copies ready":"Continue / retry unfinished"}</Button></>}</DialogActions>
   </div>:<form className="space-y-5" onSubmit={e=>{e.preventDefault();void run({name:name.trim(),startDate,items:selected.map(sourceId=>({sourceId,requestId:crypto.randomUUID()}))});}}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="New season name"><Input required maxLength={120} placeholder="Spring 2027" value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="New season starts"><Input required type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field></div>
    <p className="text-sm text-fg-muted">Select one source season per league. Copies stay in their existing leagues. Review each draft before opening registration.</p>
    <Field label="Find a league or season"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search"/></Field>
    <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="secondary" onClick={()=>{const latest=new Map<string,Season>();for(const s of seasons)if(!latest.has(s.leagueId) || latest.get(s.leagueId)!.startDate<s.startDate)latest.set(s.leagueId,s);setSelected([...latest.values()].slice(0,70).map(s=>s.id));}}>Select latest season per league</Button><span className="text-sm text-fg-muted">{selected.length} selected</span></div>
    <fieldset className="max-h-64 space-y-2 overflow-auto"><legend className="sr-only">Source seasons</legend>{visible.map(s=><label key={s.id} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"><input type="checkbox" checked={selected.includes(s.id)} disabled={!selected.includes(s.id) && (selected.length>=70 || seasons.some(other=>selected.includes(other.id) && other.leagueId===s.leagueId))} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/><span><span className="font-medium">{leagueNames[s.leagueId] ?? "League"}</span><br/>{s.name}</span></label>)}</fieldset>
    {error?<p role="alert" className="text-sm">{error}</p>:null}
    <DialogActions><Button type="button" variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={!selected.length || !name.trim() || !startDate}>Create {selected.length} draft {selected.length===1?"copy":"copies"}</Button></DialogActions>
   </form>}
  </Dialog>
 </>;
}
