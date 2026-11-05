"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Org } from "@sportspulse/api-client";
import { playoffSpotsLabel, sportLabel } from "@sportspulse/kernel";
import type { DivisionDraft, LeagueDraft, SeasonDraft } from "../types";
import { BRACKETS, SERIES, genderLabel, optionLabel, tierLabel } from "../../divisions/option-labels";
import { DivisionCard } from "./division-card";
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
  // Cards are open unless the admin collapsed them, so a division added
  // with "Add another division" opens ready to fill in (SETUP-5: it used
  // to arrive collapsed and Publish stayed disabled with no hint why).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggle(uid: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {divisions.map((d, i) => (
          <fieldset key={d.uid} disabled={savedDivisionUids?.has(d.uid)}>
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
            onRemove={() => onRemove(d.uid)}
          /></fieldset>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg-subtle px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-fg-muted hover:border-accent hover:text-accent"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
        Add another division
      </button>

      <ReviewSummary divisions={divisions} {...summary} />
    </div>
  );
}

function ReviewSummary({
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
    <section className="rounded-xl border border-border bg-bg-subtle p-6">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Review summary
      </p>
      <p className="mt-1 text-[14px] font-semibold tracking-tight text-fg">
        Confirm everything before publishing
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard title="Organization">
          <Row label="Name" value={org?.displayName ?? org?.legalName ?? "—"} />
          <Row label="Type" value={org?.orgType?.replace(/_/g, " ") ?? "—"} />
          <Row label="Region" value={org?.countryCode ?? "—"} />
          <Row label="Currency" value={org?.defaultCurrency ?? "—"} />
        </SummaryCard>

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
          <Row label="Roster lock" value={season.rosterLockAt || "—"} mono />
        </SummaryCard>

        {divisions.map((d, i) => (
          <SummaryCard key={d.uid} title={`Division ${i + 1}`}>
            <Row label="Name" value={d.name || "—"} />
            <Row label="Skill / tier" value={tierLabel(d.tier)} />
            <Row label="Gender eligibility" value={genderLabel(d.genderEligibility)} />
            <Row label="Age" value={d.ageGroupLabel || "—"} />
            <Row label="Max teams" value={String(d.maxTeams)} mono />
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
    <div className="rounded-md border border-border bg-surface-1 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-[11px] text-fg" : "text-[12px] text-fg"}>
        {value}
      </dd>
    </div>
  );
}
