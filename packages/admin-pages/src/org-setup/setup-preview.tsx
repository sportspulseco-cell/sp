"use client";
import {motion,useReducedMotion} from "framer-motion";
import {Check} from "lucide-react";
import {formatCalendarDate} from "@sportspulse/kernel";
import type {WizardState,WizardStep,SeasonPanel} from "./types";
import styles from "./setup-workspace.module.css";

/** A live draft, not invented preview data. Puck movement mirrors setup progress. */
export function SetupPreview({state,orgName,firstStep,lastStep,panel}:{state:WizardState;orgName:string;firstStep:WizardStep;lastStep:WizardStep;panel:SeasonPanel}) {
 const reduced=useReducedMotion();
 const stage=(state.step-firstStep)/(lastStep-firstStep||1);
 const puck={x:30+stage*180,y:state.step===3?(panel==='season'?74:panel==='registration'?46:74):state.step===4?100:74};
 const named=state.divisions.filter(d=>d.name.trim());
 const date=(value:string)=>formatCalendarDate(value,{month:'short',day:'numeric'});
 return <>
  <div className={styles.identity}><span>{orgName||'SportsPulse'}</span></div>

  <figure className={styles.preview} aria-label="Your season preview">
   <div className={styles.previewArt}>
    <div className={styles.previewStatus}><span>{state.step===6?'Review your season':'Season preview'}</span>{state.step===6?<Check size={14}/>:null}</div>
    <p className={styles.previewYear}>{state.season.startDate.slice(0,4)||'Season'}</p>
    <svg viewBox="0 0 240 148" fill="none" aria-hidden="true" data-preview={state.league.sportCode==="HOCKEY_ICE"?"rink":"calendar"}>
     {state.league.sportCode==="HOCKEY_ICE"?<>
     <rect x="1" y="1" width="238" height="146" rx="47" fill="var(--setup-ticket)" stroke="var(--setup-ticket-line)" strokeWidth="2"/>
     <path d="M80 3V145M160 3V145" stroke="var(--setup-ticket-line)" strokeWidth="2"/>
     <path d="M120 3V145" stroke="var(--accent-fg)" strokeOpacity=".35"/>
     <circle cx="120" cy="74" r="25" stroke="var(--accent-fg)" strokeOpacity=".35"/>
     <circle cx="120" cy="74" r="3" fill="var(--accent-fg)" fillOpacity=".35"/>
     <path d="M20 53V95M220 53V95" stroke="var(--accent-fg)" strokeOpacity=".4" strokeWidth="2"/>
     <path d="M20 58C39 58 39 90 20 90M220 58C201 58 201 90 220 90" stroke="var(--setup-ticket-line)"/>
     {[42,106].flatMap(y=>[58,182].map(x=><circle key={x+'-'+y} cx={x} cy={y} r="13" stroke="var(--setup-ticket-line)"/>))}
     </>:<>
      <rect x="1" y="1" width="238" height="146" rx="14" stroke="var(--setup-ticket-line)"/>
      <path d="M1 32H239M20 1V12M220 1V12" stroke="var(--setup-ticket-line)"/>
      {[55,82,109].flatMap(y=>[25,57,89,121,153,185,217].map(x=><rect key={x+'-'+y} x={x-4} y={y-4} width="8" height="8" rx="2" fill="var(--accent-fg)" fillOpacity=".3"/>))}
     </>}
     <motion.g initial={false} animate={{x:puck.x,y:puck.y}} transition={{type:'tween',duration:reduced?0:.55,ease:[.16,1,.3,1]}}>
      <circle r="15" fill="var(--setup-ticket-halo)"/><circle r="8" fill="var(--accent-fg)"/><circle cx="-2" cy="-2" r="2" fill="var(--accent-hover)" fillOpacity=".6"/>
     </motion.g>
     {state.step>=4?named.slice(0,6).map((d,i)=><motion.circle key={d.uid} initial={{opacity:0,scale:reduced?1:0}} animate={{opacity:1,scale:1}} transition={{duration:reduced?0:.25}} cx={36+i*33} cy="124" r="4" fill="var(--accent-fg)"/>):null}
    </svg>
   </div>
   <figcaption>
    <p className={styles.previewTitle}>{state.league.name||'Your league'}</p>
    <p className={styles.previewMeta}>{state.season.name||'Add your season details'}</p>
    {state.season.startDate&&state.season.endDate?<p className={styles.previewMeta}>{date(state.season.startDate)} – {date(state.season.endDate)}</p>:null}
    {named.length&&state.step>=4?<p className={styles.previewMeta}>{named.map(d=>d.name).join(' · ')}</p>:null}
   </figcaption>
  </figure>
 </>;
}
