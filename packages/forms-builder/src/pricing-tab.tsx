"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Division, PricingTier } from "@sportspulse/api-client";
import { useFormsBuilderApi } from "./context";

export function PricingTab({
  seasonId,
  divisions,
  tiers,
  onTiersChange
}: {
  seasonId: string;
  divisions: Division[];
  tiers: PricingTier[];
  onTiersChange: (next: PricingTier[]) => void;
}) {
  const { registrationV2: REG_API } = useFormsBuilderApi();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTier() {
    setCreating(true);
    setError(null);
    try {
      const created = await REG_API.createPricingTier({
        seasonId,
        name: "New tier",
        currency: "USD",
        fullPriceCents: 10000
        // isActive left to the server: on when the season is already open (REG-19).
      });
      onTiersChange([...tiers, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tier");
    } finally {
      setCreating(false);
    }
  }

  async function patchTier(id: string, patch: Partial<PricingTier>) {
    const optimistic = tiers.map((t) => (t.id === id ? { ...t, ...patch } : t));
    onTiersChange(optimistic);
    try {
      const updated = await REG_API.updatePricingTier(id, patch);
      onTiersChange(optimistic.map((t) => (t.id === id ? updated : t)));
    } catch (e) {
      // Revert on error.
      onTiersChange(tiers);
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteTier(id: string) {
    if (!confirm("Delete this pricing tier?")) return;
    try {
      await REG_API.deletePricingTier(id);
      onTiersChange(tiers.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            // 02 · Pricing
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
            Pricing tiers
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Each tier defines a full price plus an optional payment plan
            (deposit + N installments). Auto-saves on blur.
          </p>
        </div>
        <button
          type="button"
          onClick={addTier}
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-fg px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-widest text-bg disabled:opacity-50"
        >
          <Plus className="h-3 w-3" strokeWidth={2.25} />
          New tier
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-[12px] text-error">
          {error}
        </div>
      )}

      {tiers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center">
          <p className="text-[14px] text-fg-muted">
            No pricing tiers yet. Click <span className="font-mono">New tier</span>{" "}
            to add one.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {tiers.map((t) => (
            <TierCard
              key={t.id}
              tier={t}
              divisions={divisions}
              onPatch={(patch) => patchTier(t.id, patch)}
              onDelete={() => deleteTier(t.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TierCard({
  tier,
  divisions,
  onPatch,
  onDelete
}: {
  tier: PricingTier;
  divisions: Division[];
  onPatch: (patch: Partial<PricingTier>) => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <input
            defaultValue={tier.name}
            onBlur={(e) =>
              e.target.value !== tier.name && onPatch({ name: e.target.value })
            }
            className="w-full bg-transparent text-[16px] font-semibold tracking-tight text-fg outline-none focus:bg-surface-2 focus:px-1 focus:py-0.5 focus:rounded"
          />
          <p className="mt-1 font-mono text-[11px] tabular-nums text-fg-muted">
            Created {new Date(tier.createdAt).toLocaleDateString("en-CA")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleChip
            label="Active"
            value={tier.isActive}
            onChange={(v) => onPatch({ isActive: v })}
          />
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-error"
            title="Delete tier"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <MoneyField
          label={`Full price (${tier.currency})`}
          cents={tier.fullPriceCents}
          onCommit={(v) => onPatch({ fullPriceCents: v })}
        />
        <MoneyField
          label={`Deposit (${tier.currency})`}
          cents={tier.depositCents}
          onCommit={(v) => onPatch({ depositCents: v })}
        />
        <NumberField
          label="Installments"
          defaultValue={tier.installmentCount}
          onCommit={(v) => onPatch({ installmentCount: v })}
          min={0}
          max={24}
        />
        <OfferedTo tier={tier} divisions={divisions} />
        <NumberField
          label="Usage limit"
          defaultValue={tier.usageLimit ?? 0}
          onCommit={(v) => onPatch({ usageLimit: v > 0 ? v : undefined })}
          min={0}
          placeholder="0 = unlimited"
        />
        <ToggleField
          label="Payment plan"
          value={tier.paymentPlanEnabled}
          onChange={(v) => onPatch({ paymentPlanEnabled: v })}
        />
      </div>

      {tier.paymentPlanEnabled && (
        <PaymentTimeline tier={tier} />
      )}
    </li>
  );
}

function PaymentTimeline({ tier }: { tier: PricingTier }) {
  const total = tier.fullPriceCents;
  const deposit = Math.min(tier.depositCents, total);
  const remaining = Math.max(total - deposit, 0);
  const perInstallment =
    tier.installmentCount > 0
      ? Math.round(remaining / tier.installmentCount)
      : 0;
  return (
    <div className="mt-5 rounded-md border border-border bg-bg-elev p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Payment timeline
      </p>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 text-[12px]">
        <span className="font-mono text-fg-muted">Day 0</span>
        <div className="h-1.5 rounded-full bg-success/30">
          <div className="h-full w-1/4 rounded-full bg-success" />
        </div>
        <span className="font-mono tabular-nums text-fg">
          ${(deposit / 100).toFixed(2)} <span className="text-fg-muted">deposit</span>
        </span>
        {Array.from({ length: tier.installmentCount }).map((_, i) => (
          <FragmentRow
            key={i}
            day={tier.installmentIntervalDays * (i + 1)}
            amountCents={perInstallment}
          />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({ day, amountCents }: { day: number; amountCents: number }) {
  return (
    <>
      <span className="font-mono text-fg-muted">Day {day}</span>
      <div className="h-1.5 rounded-full bg-surface-2" />
      <span className="font-mono tabular-nums text-fg">
        ${(amountCents / 100).toFixed(2)}
      </span>
    </>
  );
}

/**
 * Money typed in dollars and cents ("150" or "150.00" is $150), stored in
 * cents. The editor used to ask for cents, so "150" meant $1.50 (REG-19).
 */
function MoneyField({
  label,
  cents,
  onCommit
}: {
  label: string;
  cents: number;
  onCommit: (cents: number) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        defaultValue={(cents / 100).toFixed(2)}
        onBlur={(e) => {
          const dollars = Number(e.target.value);
          if (!Number.isFinite(dollars) || dollars < 0) return;
          const next = Math.round(dollars * 100);
          if (next !== cents) onCommit(next);
        }}
        className="mt-1 w-full rounded-md border border-border bg-bg-elev px-2.5 py-1.5 font-mono text-[13px] tabular-nums text-fg focus:border-fg-muted focus:outline-none"
      />
    </label>
  );
}

function NumberField({
  label,
  defaultValue,
  onCommit,
  min,
  max,
  placeholder
}: {
  label: string;
  defaultValue: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </span>
      <input
        type="number"
        defaultValue={defaultValue}
        min={min}
        max={max}
        placeholder={placeholder}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== defaultValue) onCommit(v);
        }}
        className="mt-1 w-full rounded-md border border-border bg-bg-elev px-2.5 py-1.5 font-mono text-[13px] tabular-nums text-fg focus:border-fg-muted focus:outline-none"
      />
    </label>
  );
}

/**
 * Which divisions this price is for. Set in one place, the Divisions
 * tab's grid (REG-18); shown here so the admin sees it next to the price.
 */
function OfferedTo({ tier, divisions }: { tier: PricingTier; divisions: Division[] }) {
  const ids = tier.divisionIds ?? (tier.divisionId ? [tier.divisionId] : []);
  const names = ids.map((id) => divisions.find((d) => d.id === id)?.name ?? "A removed division");
  return (
    <div className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Divisions</span>
      <p className="mt-1 text-[13px] text-fg">{names.length ? names.join(", ") : "Whole season"}</p>
      <p className="text-[11px] text-fg-muted">Set on the Divisions tab.</p>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <ToggleChip label={value ? "On" : "Off"} value={value} onChange={onChange} />
    </div>
  );
}

function ToggleChip({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={
        value
          ? "inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-success"
          : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          value ? "bg-success" : "bg-fg-subtle"
        }`}
      />
      {label}
    </button>
  );
}
