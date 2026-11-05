"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Copy, Trash2, Ellipsis } from "lucide-react";
import { Button } from "@sportspulse/ui";
import type { Org } from "@sportspulse/api-client";
import { playoffSpotsLabel, sportLabel } from "@sportspulse/kernel";
import type { DivisionDraft, LeagueDraft, SeasonDraft } from "../types";
import { BRACKETS, SERIES, OVERTIME_RULES, genderLabel, optionLabel, tierLabel } from "../../divisions/option-labels";
import { DivisionCard } from "./division-card";
import styles from "../setup-workspace.module.css";
import { FORMATS, PRIVACY_OPTIONS } from "./league-step";

/**
 * Phase 3 — Configure divisions. Multiple divisions allowed; each is
 * its own collapsible card with the full mockup field set. The review
 * summary at the bottom mirrors every value collected across all four
 * phases so the admin can sanity-check before publishing.
 */
export function DivisionsStep({
  divisions,
  regions,
  summary,
  onPatch,
  onAdd,
  onCopy,
  onRemove,
  savedDivisionUids
}: {
  divisions: DivisionDraft[];
  /** Active regions of the selected org (Season -> Region -> Division). */
  regions: Array<{ id: string; name: string }>;
  summary: { league: LeagueDraft; season: SeasonDraft; org: Org | null };
  onPatch: (uid: string, patch: Partial<DivisionDraft>) => void;
  onAdd: () => void;
  /** Inserts a copy of the card directly below it, with no name. */
  onCopy: (uid: string) => void;
  onRemove: (uid: string) => void;
  savedDivisionUids?: ReadonlySet<string>;
}) {
  // Focus on one division at a time. Newly added or copied divisions open
  // immediately so their required name cannot be hidden.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(divisions.slice(1).map(d=>d.uid)));
  const knownDivisions = useRef(new Set(divisions.map(d=>d.uid)));
  const cards = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const added=divisions.find(d=>!knownDivisions.current.has(d.uid));
    if(added)setCollapsed(new Set(divisions.filter(d=>d.uid!==added.uid).map(d=>d.uid)));
    knownDivisions.current=new Set(divisions.map(d=>d.uid));
  },[divisions]);

  function toggle(uid: string) {
    setCollapsed(prev=>new Set(divisions.filter(d=>d.uid!==uid || !prev.has(uid)).map(d=>d.uid)));
  }

  const active=divisions.find(d=>!collapsed.has(d.uid))??divisions[0];
  const activeIndex=divisions.findIndex(d=>d.uid===active?.uid);
  useEffect(()=>{
    if(!active || active.name)return;
    // New cards first mount behind the previous selection. Focus after the
    // selected card becomes visible, rather than relying on mount autofocus.
    const frame=requestAnimationFrame(()=>{
      const card=Array.from(cards.current?.querySelectorAll<HTMLElement>('[data-division-uid]')??[]).find(node=>node.dataset.divisionUid===active.uid);
      card?.querySelector<HTMLInputElement>('input[type=text]')?.focus();
    });
    return ()=>cancelAnimationFrame(frame);
  },[active?.uid]);
  function removeActive(){if(!active)return;const next=divisions.find(d=>d.uid!==active.uid);setCollapsed(new Set(divisions.filter(d=>d.uid!==next?.uid).map(d=>d.uid)));onRemove(active.uid);}
  return (
    <div className={styles.divisionSetup}>
      <div className={styles.mobileDivisionToolbar}>
      <label className={styles.mobileDivisionPicker}>Division to edit
        <select aria-label="Division to edit" value={active?.uid??""} onChange={e=>setCollapsed(new Set(divisions.filter(d=>d.uid!==e.target.value).map(d=>d.uid)))}>
          {divisions.map((d,i)=><option key={d.uid} value={d.uid}>{d.name||`New division ${i+1}`}</option>)}
        </select>
      </label>
      <details className={styles.mobileDivisionActions} data-phone-menu>
        <summary aria-label="Division actions"><Ellipsis size={20}/></summary>
        <div>
          <Button type="button" variant="ghost" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onAdd();}}><Plus size={16}/>Add another division</Button>
          <Button type="button" variant="ghost" disabled={!!active&&savedDivisionUids?.has(active.uid)} aria-label={`Copy Division ${activeIndex+1}`} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');if(active)onCopy(active.uid);}}><Copy size={16}/>Copy division</Button>
          {divisions.length>1?<Button type="button" variant="ghost" disabled={!!active&&savedDivisionUids?.has(active.uid)} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');removeActive();}}><Trash2 size={16}/>Remove division</Button>:null}
        </div>
      </details>
      </div>
      <div ref={cards} className={styles.divisionList+" space-y-4"}>
        {divisions.map((d, i) => (
          <fieldset key={d.uid} data-division-uid={d.uid} data-active={active?.uid===d.uid} disabled={savedDivisionUids?.has(d.uid)}>
          {savedDivisionUids?.has(d.uid) ? <p className="mb-2 text-sm text-fg-muted">Saved. Edit this division from the season page after setup finishes.</p> : null}
          <DivisionCard
            index={i}
            total={divisions.length}
            division={d}
            regions={regions}
            expanded={!collapsed.has(d.uid)}
            onToggle={() => toggle(d.uid)}
            onPatch={(patch) => onPatch(d.uid, patch)}
            onCopy={() => onCopy(d.uid)}
            onRemove={() => {const next=divisions.find(x=>x.uid!==d.uid&&!collapsed.has(x.uid))??divisions.find(x=>x.uid!==d.uid);setCollapsed(new Set(divisions.filter(x=>x.uid!==next?.uid).map(x=>x.uid)));onRemove(d.uid);}}
          /></fieldset>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className={styles.addDivision}
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
        Add another division
      </button>

      <details className={styles.configDisclosure}><summary className="cursor-pointer text-sm font-medium">Review league and division settings</summary><div className="mt-4"><ReviewSummary divisions={divisions} {...summary}/></div></details>
    </div>
  );
}

export function ReviewSummary({
  divisions,
  league,
  season,
  org
}: {
  divisions: DivisionDraft[];
  league: LeagueDraft;
  season: SeasonDraft;
  org: Org | null;
}) {
  return (
    <section aria-label="Detailed setup settings">
      <div className={styles.rulesGrid}>
        {org ? <SummaryCard title="Organization">
          <Row label="Name" value={org?.displayName ?? org?.legalName ?? "—"} />
          <Row label="Type" value={org?.orgType?.replace(/_/g, " ") ?? "—"} />
          <Row label="Region" value={org?.countryCode ?? "—"} />
          <Row label="Currency" value={org?.defaultCurrency ?? "—"} />
        </SummaryCard> : null}

        {/* The words the forms used, never the stored codes (PPHL reads values literally). */}
        <SummaryCard title="League">
          <Row label="Name" value={league.name || "—"} />
          <Row label="Slug" value={league.slug || "—"} mono />
          <Row label="Sport" value={sportLabel(league.sportCode)} />
          <Row label="Format" value={optionLabel(FORMATS, league.format)} />
          <Row label="Privacy" value={optionLabel(PRIVACY_OPTIONS, league.privacy, { short: true })} />
          <Row label="Time zone" value={league.timezone} mono />
        </SummaryCard>

        <SummaryCard title="Season">
          <Row label="Name" value={season.name || "—"} />
          <Row
            label="Playing window"
            value={`${season.startDate || "—"} → ${season.endDate || "—"}`}
            mono
          />
          <Row
            label="Registration"
            value={`${season.registrationOpensAt || "—"} → ${season.registrationClosesAt || "—"}`}
            mono
          />
          <Row label="Playoff window" value={season.playoffStartDate ? `${season.playoffStartDate} → ${season.playoffEndDate}` : "Not set"} />
          <Row label="Roster lock" value={season.rosterLockAt || "—"} mono />
        </SummaryCard>

        {divisions.map((d, i) => (
          <SummaryCard key={d.uid} title={`Division ${i + 1}`}>
            <Row label="Name" value={d.name || "—"} />
            <Row label="Skill / tier" value={tierLabel(d.tier)} />
            <Row label="Gender eligibility" value={genderLabel(d.genderEligibility)} />
            <Row label="Age" value={d.ageGroupLabel || "—"} />
            <Row label="Min age" value={d.ageRangeMin===null?"No minimum":String(d.ageRangeMin)} />
            <Row label="Max age" value={d.ageRangeMax===null?"No maximum":String(d.ageRangeMax)} />
            <Row label="Max teams" value={String(d.maxTeams)} mono />
            <Row label="Periods" value={`${d.gameRules.numberOfPeriods} × ${d.gameRules.periodLengthMin} min`} />
            <Row label="Min skaters to start" value={String(d.gameRules.minStartersToStart)} />
            <Row label="Regular-season overtime" value={optionLabel(OVERTIME_RULES,d.gameRules.overtimeRule)} />
            <Row label="Playoff overtime" value={d.playoffConfig.overtimeRule ? optionLabel(OVERTIME_RULES,d.playoffConfig.overtimeRule) : "Inherit regular-season rule"} />
            <Row
              label="Playoffs"
              value={d.playoffConfig.enabled ? "Enabled" : "Disabled"}
              mono
            />
            {d.playoffConfig.enabled ? (
              <>
                <Row
                  label="Playoff spots"
                  value={playoffSpotsLabel(d.playoffConfig.playoffSpots)}
                  mono
                />
                <Row label="Format" value={optionLabel(SERIES, d.playoffConfig.seriesFormat, { short: true })} />
                <Row label="Bracket" value={optionLabel(BRACKETS, d.playoffConfig.bracketType)} />
                <Row
                  label="Window"
                  value={`${d.playoffConfig.startDate || "—"} → ${d.playoffConfig.endDate || "—"}`}
                  mono
                />
              </>
            ) : null}
          </SummaryCard>
        ))}
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.ruleSection}>
      <p className={styles.ruleTitle}>
        {title}
      </p>
      <dl className="mt-2 space-y-1.5">{children}</dl>
    </div>
  );
}

function Row({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={styles.reviewRow}>
      <dt className="text-[13px] text-fg-muted">
        {label}
      </dt>
      <dd className={mono ? "text-[13px] tabular-nums text-fg" : "text-[13px] text-fg"}>
        {value}
      </dd>
    </div>
  );
}
