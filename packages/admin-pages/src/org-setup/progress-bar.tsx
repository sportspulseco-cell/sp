"use client";
import {useId,useRef} from "react";
import {motion,useReducedMotion} from "framer-motion";
import {Check,ChevronDown} from "lucide-react";
import type {WizardStep} from "./types";
import styles from "./setup-workspace.module.css";

/** The route through setup; the moving marker preserves spatial context. */
export function ProgressBar({step,labels,validation,onNavigate,lastStep=6,firstStep=1}:{
 step:WizardStep;labels:Record<WizardStep,string>;validation:Record<WizardStep,boolean>;
 onNavigate:(s:WizardStep)=>void;lastStep?:WizardStep;firstStep?:WizardStep;
}){
 const id=useId(),reduced=useReducedMotion();
 const menu=useRef<HTMLDetailsElement>(null);
 const steps=([1,2,3,4,5,6] as WizardStep[]).filter(s=>s>=firstStep&&s<=lastStep);
 const hints={1:'Choose your organization',2:'Name, sport and time zone',3:'Season and registration dates',4:'Teams, eligibility and rules',5:'Prices and required documents',6:'Check, save or publish'};
 return <nav className={styles.progress} aria-label="Season setup progress">
 <details className={styles.mobileSteps} ref={menu} data-phone-menu>
  <summary><span><strong>{labels[step]}</strong><span className={styles.mobileStepCount}>{step-firstStep+1} of {lastStep-firstStep+1}</span></span><span>Steps <ChevronDown size={14}/></span></summary>
  <ol aria-label="Setup steps">{steps.map((s,i)=><li key={s}><button type="button" aria-current={s===step?"step":undefined} disabled={s>=step} onClick={()=>{onNavigate(s);menu.current?.removeAttribute("open");}}><span>{i+1}</span>{labels[s]}{s<step&&validation[s]?<Check size={14}/>:null}</button></li>)}</ol>
 </details>
 <ol className={styles.desktopSteps}>
 {steps.map((s,i)=>{const active=s===step,done=s<step&&validation[s];return <li key={s}>
  <button type="button" className={styles.step+(done?' '+styles.completed:'')} aria-label={'Step '+(i+1)+': '+labels[s]}
   aria-current={active?'step':undefined} disabled={s>=step} onClick={()=>onNavigate(s)}>
   <span className={styles.node}>
    {active?<motion.span className={styles.nodeFill} layoutId={reduced?undefined:id+'-step'} transition={{type:'tween',duration:reduced?0:.32,ease:[.16,1,.3,1]}}/>:null}
    {done?<Check size={14} strokeWidth={1.75}/>:<span style={{position:"relative",zIndex:1}}>{i+1}</span>}
   </span>
   <span className={styles.stepText}>{labels[s]}{active?<span className={styles.stepHint}>{hints[s]}</span>:null}</span>
  </button>
 </li>;})}
 </ol></nav>;
}
