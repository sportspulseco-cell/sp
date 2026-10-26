"use client";

/**
 * Season discounts: discount codes and family pricing (family maximum and
 * sibling discount). Shared by superadmin-web and org-admin-web; each app
 * passes its own SDK calls. The API enforces scope (a season outside the
 * admin's league or org is 404) and every rule; this screen only collects
 * input and shows what the server stored.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, TicketPercent, Users } from "lucide-react";
import {
  discountCodeTextProblem,
  discountRuleLabel,
  discountRuleProblem,
  formatMoney,
  normalizeDiscountCode
} from "@sportspulse/kernel";
import type {
  DiscountCode,
  DiscountCodeInput,
  DiscountCodeSummary,
  DiscountCodeUse,
  FamilyPricing,
  FamilyPricingInput
} from "@sportspulse/api-client";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogActions,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR
} from "@sportspulse/ui";

export interface DiscountsApi {
  listCodes(seasonId: string): Promise<DiscountCodeSummary[]>;
  createCode(body: DiscountCodeInput & { seasonId: string; code: string }): Promise<DiscountCode>;
  updateCode(id: string, body: Partial<DiscountCodeInput>): Promise<DiscountCode>;
  uses(id: string): Promise<{ code: DiscountCode; uses: DiscountCodeUse[] }>;
  getFamily(seasonId: string): Promise<{ rule: FamilyPricing | null }>;
  putFamily(body: FamilyPricingInput & { seasonId: string }): Promise<{ rule: FamilyPricing | null }>;
  listDivisions(seasonId: string): Promise<Array<{ id: string; name: string }>>;
  listPrices(seasonId: string): Promise<Array<{ id: string; name: string; fullPriceCents: number; currency: string }>>;
}

export interface DiscountsPanelProps {
  seasons: Array<{ id: string; name: string }>;
  /** The season to open on (e.g. ?season= or the current season). */
  initialSeasonId?: string | null;
  api: DiscountsApi;
}

const toCents = (dollars: string) => {
  const n = parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const toBp = (pct: string) => {
  const n = parseFloat(pct);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export function DiscountsPanel({ seasons, initialSeasonId, api }: DiscountsPanelProps) {
  const [seasonId, setSeasonId] = useState<string>(
    initialSeasonId && seasons.some((s) => s.id === initialSeasonId) ? initialSeasonId : seasons[0]?.id ?? ""
  );
  const [codes, setCodes] = useState<DiscountCodeSummary[] | null>(null);
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string }>>([]);
  const [prices, setPrices] = useState<Array<{ id: string; name: string; fullPriceCents: number; currency: string }>>([]);
  const [family, setFamily] = useState<FamilyPricing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [usesFor, setUsesFor] = useState<DiscountCodeSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seasonId) return;
    setError(null);
    try {
      const [c, d, p, f] = await Promise.all([
        api.listCodes(seasonId),
        api.listDivisions(seasonId),
        api.listPrices(seasonId),
        api.getFamily(seasonId)
      ]);
      setCodes(c);
      setDivisions(d);
      setPrices(p);
      setFamily(f.rule);
    } catch (e) {
      setError((e as Error).message);
      setCodes([]);
    }
  }, [api, seasonId]);

  useEffect(() => {
    setCodes(null);
    void load();
  }, [load]);

  const currency = prices[0]?.currency ?? "USD";
  const nameOf = (ids: string[], list: Array<{ id: string; name: string }>) =>
    ids.map((id) => list.find((x) => x.id === id)?.name ?? "Removed").join(", ");

  async function toggle(c: DiscountCodeSummary) {
    setBusy(c.id);
    setError(null);
    try {
      await api.updateCode(c.id, { isActive: !c.isActive });
      setFlash(`${c.code} is ${c.isActive ? "off" : "on"}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (seasons.length === 0) {
    return (
      <EmptyState
        icon={TicketPercent}
        title="No seasons yet"
        description="Create a season first. Discount codes and family pricing belong to one season."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <Field label="Season">
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {flash ? <Alert tone="success">{flash}</Alert> : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>Discount codes</Eyebrow>
          <Button onClick={() => setCreating(true)} disabled={!seasonId}>
            <Plus className="mr-2 h-4 w-4" /> New code
          </Button>
        </div>
        {codes === null ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading codes
          </p>
        ) : codes.length === 0 ? (
          <EmptyState
            icon={TicketPercent}
            title="No discount codes for this season"
            description="Players type a code at the payment step. Make one for early registration, a sponsor or a returning team."
            action={<Button onClick={() => setCreating(true)}>New code</Button>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Off</TH>
                <TH>Uses</TH>
                <TH>Valid</TH>
                <TH>For</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {codes.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <span className="font-mono font-semibold">{c.code}</span>
                    {c.description ? <span className="block text-[12px] text-fg-muted">{c.description}</span> : null}
                  </TD>
                  <TD>{discountRuleLabel(c, currency)}</TD>
                  <TD className="tabular-nums">
                    {c.usageCount}
                    {c.usageLimit !== null ? ` of ${c.usageLimit}` : ""}
                    {c.discountGivenCents > 0 ? (
                      <span className="block text-[12px] text-fg-muted">{formatMoney(c.discountGivenCents, currency)} off so far</span>
                    ) : null}
                  </TD>
                  <TD className="text-[12px]">
                    {c.validFrom || c.validTo ? `${c.validFrom ?? "any day"} to ${c.validTo ?? "no end"}` : "Any day"}
                  </TD>
                  <TD className="text-[12px]">
                    {c.divisionIds.length === 0 && c.pricingTierIds.length === 0
                      ? "Every registration"
                      : [
                          c.divisionIds.length ? nameOf(c.divisionIds, divisions) : null,
                          c.pricingTierIds.length ? nameOf(c.pricingTierIds, prices) : null
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </TD>
                  <TD>
                    <Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "On" : "Off"}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setUsesFor(c)}>
                        Uses
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => void toggle(c)}>
                        {c.isActive ? "Turn off" : "Turn on"}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <FamilySection
        key={seasonId}
        seasonId={seasonId}
        family={family}
        currency={currency}
        onSave={async (body) => {
          const r = await api.putFamily({ ...body, seasonId });
          setFamily(r.rule);
          setFlash("Family pricing saved. It applies to registrations paid from now on.");
        }}
      />

      <NewCodeDialog
        open={creating}
        onClose={() => setCreating(false)}
        divisions={divisions}
        prices={prices}
        currency={currency}
        onCreate={async (body) => {
          const c = await api.createCode({ ...body, seasonId });
          setCreating(false);
          setFlash(`${c.code} created.`);
          await load();
        }}
      />

      <UsesDialog code={usesFor} api={api} currency={currency} onClose={() => setUsesFor(null)} />
    </div>
  );
}

function NewCodeDialog({
  open,
  onClose,
  divisions,
  prices,
  currency,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  divisions: Array<{ id: string; name: string }>;
  prices: Array<{ id: string; name: string; fullPriceCents: number; currency: string }>;
  currency: string;
  onCreate: (body: DiscountCodeInput & { code: string }) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [limit, setLimit] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [tierIds, setTierIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setDescription("");
      setKind("percent");
      setValue("");
      setLimit("");
      setValidFrom("");
      setValidTo("");
      setDivisionIds([]);
      setTierIds([]);
      setError(null);
    }
  }, [open]);

  const normalized = normalizeDiscountCode(code);
  const rule = kind === "percent" ? { kind, percentBasisPoints: toBp(value) } : { kind, amountCents: toCents(value) };
  const problem = useMemo(() => {
    if (!normalized) return "Enter a code.";
    return (
      discountCodeTextProblem(normalized) ??
      (value ? discountRuleProblem(rule) : kind === "percent" ? "Enter the percent off." : "Enter the amount off.") ??
      (limit && !(Number.isInteger(Number(limit)) && Number(limit) >= 1) ? "The usage limit is a whole number of 1 or more." : null) ??
      (validFrom && validTo && validFrom > validTo ? "The first day must be on or before the last day." : null)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, kind, value, limit, validFrom, validTo]);

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function save() {
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        code: normalized,
        description: description.trim() || null,
        kind,
        ...(kind === "percent" ? { percentBasisPoints: toBp(value) } : { amountCents: toCents(value) }),
        usageLimit: limit ? Number(limit) : null,
        validFrom: validFrom || null,
        validTo: validTo || null,
        divisionIds,
        pricingTierIds: tierIds
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New discount code" description="Players type it at the payment step. Case and spaces do not matter." size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint={normalized ? `Players type ${normalized}` : undefined}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EARLYBIRD" autoComplete="off" />
        </Field>
        <Field label="Note for admins (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Early registration" />
        </Field>
        <Field label="Discount">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")}>
            <option value="percent">Percent off</option>
            <option value="fixed">Amount off</option>
          </Select>
        </Field>
        <Field label={kind === "percent" ? "Percent off" : `Amount off (${currency})`}>
          <Input type="number" step={kind === "percent" ? "0.01" : "0.01"} min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "percent" ? "10" : "25.00"} />
        </Field>
        <Field label="Usage limit" hint="Empty: no limit">
          <Input type="number" min={1} step={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <div />
        <Field label="First day (optional)">
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Field label="Last day (optional)">
          <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </Field>
      </div>
      {divisions.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-fg">Divisions (none ticked: every division)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {divisions.map((d) => (
              <label key={d.id} className="flex items-center gap-1.5 text-[13px] text-fg">
                <input type="checkbox" checked={divisionIds.includes(d.id)} onChange={() => setDivisionIds((l) => toggleIn(l, d.id))} />
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {prices.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-fg">Prices (none ticked: every price)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {prices.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-[13px] text-fg">
                <input type="checkbox" checked={tierIds.includes(p.id)} onChange={() => setTierIds((l) => toggleIn(l, p.id))} />
                {p.name} ({formatMoney(p.fullPriceCents, p.currency)})
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {(code || value) && problem ? <p className="mt-3 text-[12px] text-[var(--tint-rose-fg)]">{problem}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving || !!problem}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create code
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function UsesDialog({
  code,
  api,
  currency,
  onClose
}: {
  code: DiscountCodeSummary | null;
  api: DiscountsApi;
  currency: string;
  onClose: () => void;
}) {
  const [uses, setUses] = useState<DiscountCodeUse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    setUses(null);
    setError(null);
    api
      .uses(code.id)
      .then((r) => setUses(r.uses))
      .catch((e) => setError((e as Error).message));
  }, [api, code]);
  return (
    <Dialog open={code !== null} onClose={onClose} title={code ? `Uses of ${code.code}` : "Uses"} size="lg">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {uses === null && !error ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </p>
      ) : uses && uses.length === 0 ? (
        <p className="text-sm text-fg-muted">Nobody has used this code yet.</p>
      ) : uses ? (
        <Table>
          <THead>
            <TR>
              <TH>Player</TH>
              <TH>Invoice</TH>
              <TH>Off</TH>
              <TH>Registration</TH>
              <TH>Use</TH>
            </TR>
          </THead>
          <TBody>
            {uses.map((u) => (
              <TR key={u.id}>
                <TD>
                  {u.playerName}
                  {u.email ? <span className="block text-[12px] text-fg-muted">{u.email}</span> : null}
                </TD>
                <TD className="font-mono text-[12px]">{u.invoiceNumber ?? "None"}</TD>
                <TD className="tabular-nums">{formatMoney(u.amountCents, currency)}</TD>
                <TD className="text-[12px]">{(u.registrationStatus ?? "unknown").replace(/_/g, " ")}</TD>
                <TD>
                  <Badge tone={u.status === "active" ? "success" : "neutral"}>
                    {u.status === "active" ? "Counted" : "Given back"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FamilySection({
  family,
  currency,
  onSave
}: {
  seasonId: string;
  family: FamilyPricing | null;
  currency: string;
  onSave: (body: FamilyPricingInput) => Promise<void>;
}) {
  const [max, setMax] = useState(family?.familyMaxCents != null ? (family.familyMaxCents / 100).toFixed(2) : "");
  const [kind, setKind] = useState<"none" | "percent" | "fixed">(family?.siblingKind ?? "none");
  const [value, setValue] = useState(
    family?.siblingKind === "percent"
      ? String((family.siblingPercentBasisPoints ?? 0) / 100)
      : family?.siblingKind === "fixed"
        ? ((family.siblingAmountCents ?? 0) / 100).toFixed(2)
        : ""
  );
  const [fromNth, setFromNth] = useState(String(family?.siblingFromNth ?? 2));
  const [active, setActive] = useState(family?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMax(family?.familyMaxCents != null ? (family.familyMaxCents / 100).toFixed(2) : "");
    setKind(family?.siblingKind ?? "none");
    setValue(
      family?.siblingKind === "percent"
        ? String((family.siblingPercentBasisPoints ?? 0) / 100)
        : family?.siblingKind === "fixed"
          ? ((family.siblingAmountCents ?? 0) / 100).toFixed(2)
          : ""
    );
    setFromNth(String(family?.siblingFromNth ?? 2));
    setActive(family?.isActive ?? true);
  }, [family]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        familyMaxCents: max ? toCents(max) : null,
        siblingKind: kind === "none" ? null : kind,
        siblingPercentBasisPoints: kind === "percent" ? toBp(value) : null,
        siblingAmountCents: kind === "fixed" ? toCents(value) : null,
        siblingFromNth: Number(fromNth),
        isActive: active
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-fg-muted" />
        <Eyebrow>Family pricing</Eyebrow>
      </div>
      <p className="text-[13px] text-fg-muted">
        A family is the parent or guardian paying, with their children and themselves. The sibling discount comes off
        each registration from the player you pick on; the family maximum caps what one family pays this season. Both show
        as lines on the invoice. Invoices already sent keep their price.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={`Family maximum (${currency})`} hint="Empty: no maximum">
          <Input type="number" min={0} step="0.01" value={max} onChange={(e) => setMax(e.target.value)} placeholder="900.00" />
        </Field>
        <Field label="Sibling discount">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "none" | "percent" | "fixed")}>
            <option value="none">None</option>
            <option value="percent">Percent off</option>
            <option value="fixed">Amount off</option>
          </Select>
        </Field>
        <Field label={kind === "fixed" ? `Amount off (${currency})` : "Percent off"}>
          <Input type="number" min={0} step="0.01" value={value} disabled={kind === "none"} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Starting with">
          <Select value={fromNth} disabled={kind === "none"} onChange={(e) => setFromNth(e.target.value)}>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 2 ? "2nd player" : n === 3 ? "3rd player" : `${n}th player`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-fg">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Family pricing is on for this season
      </label>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save family pricing
        </Button>
      </div>
    </section>
  );
}
