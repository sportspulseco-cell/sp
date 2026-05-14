"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import type {
  Division,
  PricingTier,
  Season
} from "@sportspulse/api-client";
import { leagueMgmt, registrationV2 } from "@/lib/api/browser-api";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";

/**
 * Divisions & eligibility client. Two cards:
 *   1) "Assign divisions to pricing tier" — checkbox grid against the
 *      currently-selected tier (defaults to first standard tier).
 *      Auto-saves via PUT /pricing-tier-divisions/:tierId on toggle.
 *   2) "Eligibility & roster rules" — writes to seasons.config via
 *      leagueMgmt.updateSeasonConfig (existing endpoint).
 */
export function DivisionsClient({
  formId: _formId,
  season,
  tiers,
  divisions,
  tierAssignments
}: {
  formId: string;
  season: Season;
  tiers: PricingTier[];
  divisions: Division[];
  tierAssignments: Record<string, string[]>;
}) {
  const router = useRouter();
  const [activeTierId, setActiveTierId] = useState<string | null>(
    tiers[0]?.id ?? null
  );
  const [assignments, setAssignments] = useState<Record<string, string[]>>(
    () => ({ ...tierAssignments })
  );
  const [savingTier, setSavingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Eligibility state — JSONB toggles live on season.config; rosterLockAt
  // is the canonical seasons.roster_lock_at column (P0-5).
  const initialConfig = (season.config ?? {}) as {
    maxRosterSize?: number;
    requireUsaHockeyId?: boolean;
    requireLiabilityWaiver?: boolean;
    requireCodeOfConduct?: boolean;
    liabilityWaiverContent?: string;
    codeOfConductContent?: string;
    allowFreeAgent?: boolean;
    parentalConsentRequired?: boolean;
  };
  const [maxRosterSize, setMaxRosterSize] = useState<number>(
    initialConfig.maxRosterSize ?? 20
  );
  const [rosterLockAt, setRosterLockAt] = useState<string>(
    season.rosterLockAt ? season.rosterLockAt.slice(0, 10) : ""
  );
  const [requireUsaHockeyId, setRequireUsaHockeyId] = useState(
    initialConfig.requireUsaHockeyId ?? true
  );
  const [requireLiabilityWaiver, setRequireLiabilityWaiver] = useState(
    initialConfig.requireLiabilityWaiver ?? true
  );
  const [requireCodeOfConduct, setRequireCodeOfConduct] = useState(
    initialConfig.requireCodeOfConduct ?? true
  );
  const [liabilityWaiverContent, setLiabilityWaiverContent] = useState(
    initialConfig.liabilityWaiverContent ?? ""
  );
  const [codeOfConductContent, setCodeOfConductContent] = useState(
    initialConfig.codeOfConductContent ?? ""
  );
  const [allowFreeAgent, setAllowFreeAgent] = useState(
    initialConfig.allowFreeAgent ?? true
  );
  const [parentalConsent, setParentalConsent] = useState(
    initialConfig.parentalConsentRequired ?? true
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const activeTier = useMemo(
    () => tiers.find((t) => t.id === activeTierId) ?? null,
    [tiers, activeTierId]
  );

  const checkedSet = new Set(activeTier ? assignments[activeTier.id] ?? [] : []);

  async function toggleDivision(divisionId: string) {
    if (!activeTier) return;
    setError(null);
    const current = assignments[activeTier.id] ?? [];
    const next = current.includes(divisionId)
      ? current.filter((d) => d !== divisionId)
      : [...current, divisionId];

    // Optimistic update.
    setAssignments((prev) => ({ ...prev, [activeTier.id]: next }));
    setSavingTier(activeTier.id);
    try {
      await registrationV2.replaceTierDivisions(activeTier.id, next);
      router.refresh();
    } catch (e) {
      // Revert on error.
      setAssignments((prev) => ({ ...prev, [activeTier.id]: current }));
      setError((e as Error).message);
    } finally {
      setSavingTier(null);
    }
  }

  async function saveEligibility() {
    setSavingConfig(true);
    setConfigSaved(false);
    setError(null);
    try {
      // rosterLockAt → seasons.roster_lock_at column; everything else
      // → seasons.config JSONB (P0-5 split).
      await Promise.all([
        leagueMgmt.updateSeason(season.id, {
          rosterLockAt: rosterLockAt
            ? new Date(rosterLockAt + "T23:59:59").toISOString()
            : null
        }),
        leagueMgmt.updateSeasonConfig(season.id, {
          maxRosterSize,
          requireUsaHockeyId,
          requireLiabilityWaiver,
          requireCodeOfConduct,
          liabilityWaiverContent: liabilityWaiverContent.trim(),
          codeOfConductContent: codeOfConductContent.trim(),
          allowFreeAgent,
          parentalConsentRequired: parentalConsent
        })
      ]);
      setConfigSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingConfig(false);
    }
  }

  const uncoveredCount = divisions.filter(
    (d) =>
      !Object.values(assignments).some((arr) => arr.includes(d.id))
  ).length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Divisions & eligibility"
        warning={
          uncoveredCount > 0
            ? `Warning: ${uncoveredCount} division${uncoveredCount === 1 ? " has" : "s have"} no pricing tier assigned`
            : null
        }
      />

      {/* Card 1 — Assign divisions */}
      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Assign divisions to pricing tier
        </p>

        {tiers.length === 0 ? (
          <p className="text-[12px] text-fg-muted">
            No pricing tiers yet — create one in the Pricing section first.
          </p>
        ) : (
          <>
            {tiers.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {tiers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTierId(t.id)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px]",
                      activeTierId === t.id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-subtle text-fg-muted hover:border-fg-muted"
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            ) : null}

            <p className="text-[12px] text-fg-muted">
              Select which divisions can register under{" "}
              <span className="font-medium text-fg">
                "{activeTier?.name ?? "—"}"
              </span>
              {savingTier === activeTier?.id ? (
                <span className="ml-2 inline-flex items-center gap-1 text-fg-muted">
                  <Loader2 className="h-3 w-3 animate-spin" /> saving…
                </span>
              ) : null}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {divisions.map((d) => {
                const checked = checkedSet.has(d.id);
                return (
                  <label
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors cursor-pointer",
                      checked
                        ? "border-accent bg-accent/10"
                        : "border-border bg-bg-subtle hover:border-fg-muted"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDivision(d.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="text-[13px] text-fg">{d.name}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Card 2 — Eligibility & roster rules */}
      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Eligibility &amp; roster rules
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max roster size" schemaTag="seasons.config.maxRosterSize">
            <input
              type="number"
              min={1}
              max={100}
              value={maxRosterSize}
              onChange={(e) =>
                setMaxRosterSize(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="input"
            />
          </Field>
          <Field label="Roster lock date" schemaTag="seasons.roster_lock_at">
            <input
              type="date"
              value={rosterLockAt}
              onChange={(e) => setRosterLockAt(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <ToggleRow
          label="Require USA Hockey ID"
          hint="Players must submit valid governing body ID + expiry"
          schemaTag="seasons.config.requireUsaHockeyId"
          checked={requireUsaHockeyId}
          onChange={setRequireUsaHockeyId}
        />
        <ToggleRow
          label="Require liability waiver"
          hint="Hard block — registration cannot complete without signature"
          schemaTag="seasons.config.requireLiabilityWaiver"
          checked={requireLiabilityWaiver}
          onChange={setRequireLiabilityWaiver}
        />
        {requireLiabilityWaiver ? (
          <DocBodyField
            label="Liability waiver text"
            schemaTag="seasons.config.liabilityWaiverContent"
            placeholder="Paste the liability waiver text here. The registrant scrolls to the end then types their full legal name to sign…"
            value={liabilityWaiverContent}
            onChange={setLiabilityWaiverContent}
          />
        ) : null}
        <ToggleRow
          label="Require code of conduct"
          hint="Hard block — registrant must check the acknowledgment"
          schemaTag="seasons.config.requireCodeOfConduct"
          checked={requireCodeOfConduct}
          onChange={setRequireCodeOfConduct}
        />
        {requireCodeOfConduct ? (
          <DocBodyField
            label="Code of conduct text"
            schemaTag="seasons.config.codeOfConductContent"
            placeholder="Paste the code of conduct text. The registrant sees this above the agreement checkbox in Phase 3…"
            value={codeOfConductContent}
            onChange={setCodeOfConductContent}
          />
        ) : null}
        <ToggleRow
          label="Allow free agent registration"
          hint="Players can join a pool and wait for a captain invite"
          schemaTag="seasons.config.allowFreeAgent"
          checked={allowFreeAgent}
          onChange={setAllowFreeAgent}
        />
        <ToggleRow
          label="Parental consent for minors"
          hint="Auto-triggered if DOB indicates age under 18"
          schemaTag="seasons.config.parentalConsentRequired"
          checked={parentalConsent}
          onChange={setParentalConsent}
        />

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        {configSaved ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
            Eligibility rules saved.
          </p>
        ) : null}

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" onClick={saveEligibility} disabled={savingConfig}>
            {savingConfig ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-widest">
              Save eligibility rules
            </span>
          </Button>
        </div>
      </section>

      <FieldStyle />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  schemaTag,
  checked,
  onChange
}: {
  label: string;
  hint: string;
  schemaTag: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-fg">{label}</p>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
            {schemaTag}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-fg-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-blue-500" : "bg-fg-muted/30"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

/**
 * Multi-line body editor for the liability-waiver and code-of-conduct
 * documents. Sits indented under the matching require-* toggle so the
 * relationship reads top-to-bottom: enable → author the body. Empty
 * value falls back to the canned text in the funnel.
 */
function DocBodyField({
  label,
  schemaTag,
  placeholder,
  value,
  onChange
}: {
  label: string;
  schemaTag: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="ml-4 border-l-2 border-border/60 pl-4 -mt-1 pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </label>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
          {schemaTag}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder={placeholder}
        className="mt-1.5 w-full resize-y rounded-md border border-border bg-bg-subtle p-3 text-[13px] leading-relaxed text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-fg-muted">
        Paste your existing legal text — file uploads land in a future
        wave. Empty falls back to the SportsPulse default.
      </p>
    </div>
  );
}

function Field({
  label,
  schemaTag,
  children
}: {
  label: string;
  schemaTag?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="font-mono text-[11px] uppercase tracking-widest text-fg">
          {label}
        </label>
        {schemaTag ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
            {schemaTag}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function FieldStyle() {
  return (
    <style>{`
      .input {
        height: 2.5rem;
        width: 100%;
        border-radius: 0.375rem;
        border: 1px solid var(--border);
        background: var(--surface-1);
        padding: 0 0.75rem;
        color: var(--fg);
        font-size: 13px;
      }
      .input:focus { outline: none; border-color: var(--accent); }
    `}</style>
  );
}
