"use client";
import styles from "../setup-workspace.module.css";
import type { SeasonDraft,SeasonPanel } from "../types";
import { Field } from "./league-step";
import { Input,Select,cn } from "@sportspulse/ui";
import { calendarDateInZone } from "@sportspulse/kernel";
const PANELS:SeasonPanel[]=['season','registration','options'];
const LABELS:Record<SeasonPanel,string>={season:'Season dates',registration:'Registration dates',options:'Playoffs & rosters'};
/** One date question at a time; every answer stays in the same persisted draft. */
export function SeasonStep({draft,leagueName,onChange,timezone,panel,onPanelChange,checks}:{
  draft:SeasonDraft;leagueName:string;onChange:(patch:Partial<SeasonDraft>)=>void;timezone?:string;
  panel:SeasonPanel;onPanelChange:(panel:SeasonPanel)=>void;checks:Record<SeasonPanel,boolean>;
}){
 const today=calendarDateInZone(new Date(),timezone??Intl.DateTimeFormat().resolvedOptions().timeZone);
 const date=(key:Exclude<keyof SeasonDraft,'name'>,label:string,opts:{required?:boolean;min?:string;max?:string}={})=><Field label={label} required={opts.required}>
  <Input type="date" value={draft[key]} onChange={e=>onChange({[key]:e.target.value})} min={opts.min} max={opts.max} required={opts.required}/>
 </Field>;
 return <div className="space-y-5">
  <Select className={styles.mobileDateQuestions} aria-label="Date questions" value={panel} onChange={e=>onPanelChange(e.target.value as SeasonPanel)}>{PANELS.map((p,i)=><option key={p} value={p} disabled={i>PANELS.indexOf(panel)}>{LABELS[p]} · {i+1} of 3</option>)}</Select>
  <nav aria-label="Date questions" className={styles.desktopDateQuestions+" flex flex-wrap gap-2"}>
   {PANELS.map((p,i)=><button key={p} type="button" aria-current={panel===p?'step':undefined}
    disabled={i>PANELS.indexOf(panel)} onClick={()=>onPanelChange(p)}
    className={cn('rounded-md border px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default',panel===p?'border-accent bg-accent/5 font-medium text-fg':'border-border text-fg-muted enabled:hover:bg-surface-2')}>{LABELS[p]}</button>)}
  </nav>
  <section className={styles.section+" space-y-5"}>
   <p className={styles.dateContext}>{leagueName} · {timezone}</p>
   {panel==='season'?<>
    <Field label="Season name" required><Input value={draft.name} onChange={e=>onChange({name:e.target.value.slice(0,120)})} maxLength={120} placeholder="e.g. Winter 2026–27" required/></Field>
    <div className="grid gap-4 sm:grid-cols-2">{date('startDate','Season start date',{required:true,min:today})}{date('endDate','Season end date',{required:true,min:draft.startDate||today})}</div>
    <p className="text-[13px] text-fg-muted">Include the full season, through the last playoff.</p>
    {draft.startDate && draft.endDate && !checks.season ? <p role="alert" className="text-sm text-fg-danger">Enter a season name and dates from today onward. The end date must be on or after the start.</p> : null}
   </>:null}
   {panel==='registration'?<>
    <div className="grid gap-4 sm:grid-cols-2">{date('registrationOpensAt','Registration opens',{required:true,min:today})}{date('registrationClosesAt','Registration closes',{required:true,min:draft.registrationOpensAt||today})}</div>
    <p className="text-[13px] text-fg-muted">Registration opens only after you review and publish.</p>
    {draft.registrationOpensAt && draft.registrationClosesAt && !checks.registration ? <p role="alert" className="text-sm text-fg-danger">Registration dates must be today or later, with closing on or after opening.</p> : null}
   </>:null}
   {panel==='options'?<>
    <p className="text-sm text-fg-muted">Optional. Continue if these dates aren't needed yet.</p>
    <details open={!!(draft.playoffStartDate||draft.playoffEndDate)} className="rounded-md border border-border p-4">
     <summary className="cursor-pointer text-sm font-medium">Playoff dates</summary>
     <div className="mt-4 grid gap-4 sm:grid-cols-2">{date('playoffStartDate','Playoff start date',{min:draft.startDate||today,max:draft.endDate||undefined})}{date('playoffEndDate','Playoff end date',{min:draft.playoffStartDate||draft.startDate||today,max:draft.endDate||undefined})}</div>
    </details>
    <details open={!!draft.rosterLockAt} className="rounded-md border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Roster lock date</summary><div className="mt-4">{date('rosterLockAt','Roster lock date',{min:today})}</div></details>
    {!checks.options?<p role="alert" className="text-sm text-[var(--tint-rose-fg)]">Check the optional dates. Playoffs must fit the season; roster lock must be today or later.</p>:null}
   </>:null}
  </section>
 </div>;
}
