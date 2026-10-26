"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Field, Input, Select, Skeleton } from "@sportspulse/ui";
import { DATE_FORMATS, formatCalendarDate } from "@sportspulse/kernel";

export interface BlackoutRow {
  id: string;
  startDate: string;
  endDate: string;
  surfaceId: string | null;
  rinkLabel?: string | null;
  reason: string | null;
}

/** Each app binds its own API client here (superadmin-web, org-admin-web). */
export interface BlackoutApi {
  list: () => Promise<BlackoutRow[]>;
  create: (body: { startDate: string; endDate?: string; surfaceId?: string; reason?: string }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  /** The season organisation's rinks, for a one-rink blackout. */
  rinks: () => Promise<Array<{ id: string; label: string }>>;
}

/** A calendar day, not an instant, so it never shifts: "Sat, Nov 22, 2026". */
function fmtDay(d: string) {
  return formatCalendarDate(d, { ...DATE_FORMATS.date, weekday: "short" });
}

/**
 * Blackout dates (FR-3.8.4): days the generator leaves out, for every
 * rink or one rink. Saved on the server; every later Generate honours them.
 */
export function BlackoutDates({ api, disabled }: { api: BlackoutApi; disabled?: boolean }) {
  const [rows, setRows] = useState<BlackoutRow[] | null>(null);
  const [rinks, setRinks] = useState<Array<{ id: string; label: string }>>([]);
  const [form, setForm] = useState({ startDate: "", endDate: "", surfaceId: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setRows(await api.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }
  useEffect(() => {
    void reload();
    api.rinks().then(setRinks).catch(() => setRinks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.create({
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        surfaceId: form.surfaceId || undefined,
        reason: form.reason.trim() || undefined
      });
      setForm({ startDate: "", endDate: "", surfaceId: form.surfaceId, reason: "" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    setBusy(true);
    try {
      await api.remove(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-bg p-6" aria-labelledby="blackout-title">
      <div className="flex items-start gap-3">
        <CalendarOff className="mt-0.5 h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <div>
          <h2 id="blackout-title" className="text-sm font-semibold text-fg">Blackout dates</h2>
          <p className="text-[13px] text-fg-muted">
            No games are placed on these days. Leave the rink on All rinks to block the whole day.
          </p>
        </div>
      </div>

      {rows === null ? (
        <div role="status" aria-label="Loading blackout dates" className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarOff} eyebrow="blackouts" title="No blackout dates yet" description="Add a date above and the scheduler keeps games off it." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border" aria-label="Blackout dates">
          {rows.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="font-medium text-fg">
                {fmtDay(b.startDate)}
                {b.endDate !== b.startDate ? ` to ${fmtDay(b.endDate)}` : ""}
              </span>
              <span className="text-fg-muted">{b.surfaceId ? b.rinkLabel ?? "One rink" : "All rinks"}</span>
              {b.reason ? <span className="truncate text-fg-muted">· {b.reason}</span> : null}
              <Button
                type="button"
                onClick={() => onRemove(b.id)}
                disabled={busy || disabled}
                variant="ghost" size="sm" className="ml-auto gap-1 text-fg-muted"
                aria-label={`Remove blackout ${b.startDate}`}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto] sm:items-end">
        <Field label="First day">
          <Input type="date" required value={form.startDate} disabled={busy || disabled}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Last day" hint="Optional">
          <Input type="date" min={form.startDate || undefined} value={form.endDate} disabled={busy || disabled}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </Field>
        <Field label="Rink">
          <Select value={form.surfaceId} disabled={busy || disabled}
            onChange={(e) => setForm({ ...form, surfaceId: e.target.value })}>
            <option value="">All rinks</option>
            {rinks.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" hint="Optional">
          <Input value={form.reason} maxLength={200} disabled={busy || disabled} placeholder="Holiday, rink event"
            onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
        <Button type="submit" disabled={busy || disabled || !form.startDate}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : <Plus className="h-4 w-4" strokeWidth={1.75} />}
          Add blackout
        </Button>
      </form>
      {error ? <p className="text-[13px] text-fg-danger" role="alert">{error}</p> : null}
    </section>
  );
}
