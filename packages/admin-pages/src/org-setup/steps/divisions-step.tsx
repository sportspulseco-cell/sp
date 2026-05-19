"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Org } from "@sportspulse/api-client";
import type { DivisionDraft, LeagueDraft, SeasonDraft } from "../types";
import { PhaseHeader } from "./org-step";
import { DivisionCard } from "./division-card";

/**
 * Phase 3 — Configure divisions. Multiple divisions allowed; each is
 * its own collapsible card with the full mockup field set. The review
 * summary at the bottom mirrors every value collected across all four
 * phases so the admin can sanity-check before publishing.
 */
export function DivisionsStep({
  divisions,
  summary,
  onPatch,
  onAdd,
  onRemove
}: {
  divisions: DivisionDraft[];
  summary: { league: LeagueDraft; season: SeasonDraft; org: Org | null };
  onPatch: (uid: string, patch: Partial<DivisionDraft>) => void;
  onAdd: () => void;
  onRemove: (uid: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(divisions.map((d) => d.uid))
  );

  function toggle(uid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PhaseHeader
        index={3}
        title="Configure divisions"
        description="Add one or more divisions — each can have different rules, age groups, and post-season settings"
        tableTag="divisions table"
      />

      <div className="space-y-4">
        {divisions.map((d, i) => (
          <DivisionCard
            key={d.uid}
            index={i}
            total={divisions.length}
            division={d}
            expanded={expanded.has(d.uid)}
            onToggle={() => toggle(d.uid)}
            onPatch={(patch) => onPatch(d.uid, patch)}
            onRemove={() => onRemove(d.uid)}
          />
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
        // Review summary
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

        <SummaryCard title="League">
          <Row label="Name" value={league.name || "—"} />
          <Row label="Slug" value={league.slug || "—"} mono />
          <Row label="Sport" value={league.sportCode || "—"} mono />
          <Row label="Format" value={league.format} mono />
          <Row label="Privacy" value={league.privacy} mono />
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
            <Row
              label="Tier / gender"
              value={`${d.tier ?? "—"} · ${d.genderEligibility}`}
              mono
            />
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
                  label="Spots"
                  value={`Top ${d.playoffConfig.playoffSpots}`}
                  mono
                />
                <Row
                  label="Format"
                  value={d.playoffConfig.seriesFormat.replace(/_/g, " ")}
                  mono
                />
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
