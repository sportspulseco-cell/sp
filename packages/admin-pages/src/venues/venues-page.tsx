"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, ChevronDown, ChevronRight, Loader2, Plus,
  Snowflake, Trash2, RefreshCw, X
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input } from "@sportspulse/ui";

/**
 * Venue management — list venues, drill into a venue to manage
 * surfaces, drill into a surface to manage ice slots. Same component
 * mounts in sa-web and org-admin-web (consumer passes the API
 * namespace via props).
 *
 * The API is the new SchedulingInventoryController. Scope filtering
 * happens server-side via loadUserScope, so we just forward the
 * `orgId` filter when an org-admin opens the page (or unset for
 * super-admin to see everything).
 */
interface Venue {
  id: string;
  orgId: string;
  name: string;
  timezone: string;
  surfacesCount: number;
  createdAt: string;
}

interface Surface {
  id: string;
  venueId: string;
  label: string;
  iceSlotsCount: number;
  createdAt: string;
}

interface IceSlot {
  id: string;
  surfaceId: string;
  seasonId: string | null;
  startTsUtc: string;
  durationMin: number;
  tz: string;
  band: string | null;
  hourlyCostCents: number;
  isPlayoffReservation: boolean;
  status: string;
}

export interface VenuesApi {
  listVenues: (q?: { orgId?: string }) => Promise<{ items: Venue[] }>;
  getVenue: (id: string) => Promise<{ venue: Venue & { address: Record<string, unknown>; updatedAt: string }; surfaces: Surface[] }>;
  createVenue: (body: { orgId: string; name: string; timezone?: string }) => Promise<{ id: string }>;
  updateVenue: (id: string, body: { name?: string; timezone?: string }) => Promise<{ id: string }>;
  deleteVenue: (id: string) => Promise<{ ok: true }>;
  createSurface: (venueId: string, body: { label: string }) => Promise<{ id: string }>;
  deleteSurface: (id: string) => Promise<{ ok: true }>;
  listIceSlots: (surfaceId: string, q?: { fromTsUtc?: string; toTsUtc?: string }) => Promise<{ items: IceSlot[] }>;
  createIceSlot: (
    surfaceId: string,
    body: {
      startTsUtc: string;
      durationMin: number;
      tz?: string;
      band?: "early" | "mid" | "late";
      hourlyCostCents?: number;
      isPlayoffReservation?: boolean;
    }
  ) => Promise<{ id: string }>;
  bulkIceSlots: (
    surfaceId: string,
    body: {
      startDate: string;
      endDate: string;
      weekdays: number[];
      startLocalTime: string;
      durationMin: number;
      tz: string;
      band?: "early" | "mid" | "late";
      hourlyCostCents?: number;
      isPlayoffReservation?: boolean;
    }
  ) => Promise<{ created: number; skipped: number }>;
  deleteIceSlot: (id: string) => Promise<{ ok: true }>;
}

export interface VenuesPageProps {
  api: VenuesApi;
  /** Org to scope the list. When omitted, super-admin sees all orgs. */
  orgId?: string;
  /** Orgs the user can create venues in (for the org picker on create). */
  ownableOrgs?: Array<{ id: string; name: string }>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtSlotTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone: tz,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

export function VenuesPage({ api, orgId, ownableOrgs }: VenuesPageProps) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listVenues(orgId ? { orgId } : undefined);
      setVenues(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, orgId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {venues.length} venue{venues.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          {!showCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Add venue
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
            Refresh
          </Button>
        </div>
      </div>

      {showCreate ? (
        <CreateVenueForm
          api={api}
          defaultOrgId={orgId}
          ownableOrgs={ownableOrgs}
          onCancel={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void load(); }}
        />
      ) : null}

      {error ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading && venues.length === 0 ? (
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          Loading venues…
        </div>
      ) : venues.length === 0 && !showCreate ? (
        <EmptyState
          icon={Building2}
          title="No venues yet"
          description="Add a venue, then add surfaces (rinks/sheets), then add ice slots. The scheduler reads ice slots as its inventory of bookable times."
          action={<Button onClick={() => setShowCreate(true)}>Add venue</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {venues.map((v) => (
            <VenueRow
              key={v.id}
              venue={v}
              api={api}
              isOpen={expanded === v.id}
              onToggle={() => setExpanded(expanded === v.id ? null : v.id)}
              onChange={() => void load()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateVenueForm({
  api, defaultOrgId, ownableOrgs, onCancel, onCreated
}: {
  api: VenuesApi;
  defaultOrgId?: string;
  ownableOrgs?: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [orgId, setOrgId] = useState(defaultOrgId ?? ownableOrgs?.[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-bg p-4 space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">// New venue</div>
      <div className="grid gap-3 sm:grid-cols-3">
        {!defaultOrgId && ownableOrgs && ownableOrgs.length > 0 ? (
          <Field label="Organization">
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              disabled={busy}
              className="h-9 w-full rounded-md border border-border bg-bg px-2 text-fg"
            >
              {ownableOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Venue name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="QA Test Arena" disabled={busy} />
        </Field>
        <Field label="Timezone (IANA)" hint="e.g. America/New_York">
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={busy} />
        </Field>
      </div>
      {error ? <p className="text-[12px] text-rose-700 dark:text-rose-300">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!orgId || !name.trim()) {
              setError("Venue name and org are required.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await api.createVenue({ orgId, name: name.trim(), timezone: timezone.trim() || "UTC" });
              onCreated();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !name.trim() || !orgId}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          Create
        </Button>
      </div>
    </div>
  );
}

function VenueRow({
  venue, api, isOpen, onToggle, onChange
}: {
  venue: Venue;
  api: VenuesApi;
  isOpen: boolean;
  onToggle: () => void;
  onChange: () => void;
}) {
  const [surfaces, setSurfaces] = useState<Surface[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddSurface, setShowAddSurface] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.getVenue(venue.id)
      .then((res) => setSurfaces(res.surfaces))
      .catch(() => setSurfaces([]))
      .finally(() => setLoading(false));
  }, [isOpen, api, venue.id]);

  return (
    <li className="rounded-lg border border-border bg-surface-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-subtle"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[13px] font-semibold text-fg">{venue.name}</p>
          <p className="truncate text-[11px] text-fg-muted">{venue.timezone}</p>
        </div>
        <Badge tone="neutral" mono>{venue.surfacesCount} surfaces</Badge>
      </button>
      {isOpen ? (
        <div className="border-t border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Surfaces</span>
            {!showAddSurface ? (
              <Button onClick={() => setShowAddSurface(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add surface
              </Button>
            ) : null}
          </div>
          {showAddSurface ? (
            <AddSurfaceForm
              venueId={venue.id}
              api={api}
              onCancel={() => setShowAddSurface(false)}
              onCreated={() => { setShowAddSurface(false); onChange(); }}
            />
          ) : null}
          {loading && !surfaces ? (
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Loading…</p>
          ) : surfaces && surfaces.length === 0 ? (
            <p className="text-[12px] text-fg-muted">No surfaces yet. Add one above.</p>
          ) : (
            <ul className="space-y-2">
              {(surfaces ?? []).map((s) => (
                <SurfaceRow
                  key={s.id}
                  surface={s}
                  venueTz={venue.timezone}
                  api={api}
                  onChange={onChange}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function AddSurfaceForm({
  venueId, api, onCancel, onCreated
}: {
  venueId: string;
  api: VenuesApi;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-md border border-border bg-bg p-3 space-y-2">
      <Field label="Surface label" hint='e.g. "Rink A", "Blue Sheet"'>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} autoFocus />
      </Field>
      {error ? <p className="text-[12px] text-rose-700 dark:text-rose-300">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!label.trim()) return;
            setBusy(true); setError(null);
            try { await api.createSurface(venueId, { label: label.trim() }); onCreated(); }
            catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
          disabled={busy || !label.trim()}
        >Create</Button>
      </div>
    </div>
  );
}

function SurfaceRow({
  surface, venueTz, api, onChange
}: {
  surface: Surface;
  venueTz: string;
  api: VenuesApi;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<IceSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState<"single" | "bulk" | null>(null);

  const loadSlots = useCallback(() => {
    setLoading(true);
    api.listIceSlots(surface.id, {})
      .then((res) => setSlots(res.items))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [api, surface.id]);

  useEffect(() => {
    if (open && !slots) loadSlots();
  }, [open, slots, loadSlots]);

  return (
    <li className="rounded-md border border-border bg-bg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-subtle"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Snowflake className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <span className="flex-1 text-[13px] font-medium text-fg">{surface.label}</span>
        <Badge tone="neutral" mono>{surface.iceSlotsCount} slots</Badge>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete surface "${surface.label}" and all its ice slots?`)) return;
            await api.deleteSurface(surface.id);
            onChange();
          }}
          className="text-fg-muted hover:text-rose-700"
          aria-label="Delete surface"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </button>
      {open ? (
        <div className="border-t border-border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Ice slots</span>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowAdd(showAdd === "bulk" ? null : "bulk")} variant={showAdd === "bulk" ? "secondary" : "primary"}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Bulk weekly
              </Button>
              <Button onClick={() => setShowAdd(showAdd === "single" ? null : "single")} variant={showAdd === "single" ? "secondary" : "primary"}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Single slot
              </Button>
            </div>
          </div>
          {showAdd === "single" ? (
            <SingleSlotForm
              api={api}
              surfaceId={surface.id}
              tz={venueTz}
              onCancel={() => setShowAdd(null)}
              onCreated={() => { setShowAdd(null); loadSlots(); onChange(); }}
            />
          ) : null}
          {showAdd === "bulk" ? (
            <BulkSlotForm
              api={api}
              surfaceId={surface.id}
              tz={venueTz}
              onCancel={() => setShowAdd(null)}
              onCreated={() => { setShowAdd(null); loadSlots(); onChange(); }}
            />
          ) : null}
          {loading && !slots ? (
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Loading…</p>
          ) : !slots || slots.length === 0 ? (
            <p className="text-[12px] text-fg-muted">No ice slots yet. Add a weekly recurrence to fill a season quickly.</p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded border border-border bg-surface-1 px-3 py-1.5 text-[12px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-fg">{fmtSlotTime(s.startTsUtc, s.tz || venueTz)}</span>
                    <span className="text-fg-muted">· {s.durationMin}min</span>
                    {s.band ? <Badge tone="neutral" mono>{s.band}</Badge> : null}
                    {s.isPlayoffReservation ? <Badge tone="warning" mono>playoff</Badge> : null}
                    {s.status !== "available" ? <Badge tone="neutral" mono>{s.status}</Badge> : null}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Delete this ice slot?")) return;
                      await api.deleteIceSlot(s.id);
                      loadSlots();
                      onChange();
                    }}
                    className="text-fg-muted hover:text-rose-700"
                    aria-label="Delete slot"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function SingleSlotForm({
  api, surfaceId, tz, onCancel, onCreated
}: {
  api: VenuesApi;
  surfaceId: string;
  tz: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [startLocal, setStartLocal] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [band, setBand] = useState<"" | "early" | "mid" | "late">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-md border border-border bg-bg p-3 space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Start (local)">
          <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} disabled={busy} />
        </Field>
        <Field label="Duration (min)">
          <Input type="number" min={15} max={360} value={durationMin} onChange={(e) => setDurationMin(parseInt(e.target.value || "0", 10))} disabled={busy} />
        </Field>
        <Field label="Band">
          <select
            value={band}
            onChange={(e) => setBand(e.target.value as typeof band)}
            disabled={busy}
            className="h-9 w-full rounded-md border border-border bg-bg px-2 text-fg"
          >
            <option value="">—</option>
            <option value="early">early</option>
            <option value="mid">mid</option>
            <option value="late">late</option>
          </select>
        </Field>
      </div>
      {error ? <p className="text-[12px] text-rose-700 dark:text-rose-300">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!startLocal) return;
            setBusy(true); setError(null);
            try {
              await api.createIceSlot(surfaceId, {
                startTsUtc: new Date(startLocal).toISOString(),
                durationMin,
                tz,
                ...(band ? { band: band } : {})
              });
              onCreated();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally { setBusy(false); }
          }}
          disabled={busy || !startLocal}
        >Create slot</Button>
      </div>
    </div>
  );
}

function BulkSlotForm({
  api, surfaceId, tz, onCancel, onCreated
}: {
  api: VenuesApi;
  surfaceId: string;
  tz: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startLocalTime, setStartLocalTime] = useState("19:00");
  const [durationMin, setDurationMin] = useState(60);
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([1, 3, 5]));
  const [band, setBand] = useState<"" | "early" | "mid" | "late">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const toggleDay = useMemo(() => (d: number) => {
    const next = new Set(weekdays);
    if (next.has(d)) next.delete(d); else next.add(d);
    setWeekdays(next);
  }, [weekdays]);

  return (
    <div className="rounded-md border border-border bg-bg p-3 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">// Weekly recurrence</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={busy} />
        </Field>
        <Field label={`Start time (${tz})`}>
          <Input type="time" value={startLocalTime} onChange={(e) => setStartLocalTime(e.target.value)} disabled={busy} />
        </Field>
        <Field label="Duration (min)">
          <Input type="number" min={15} max={360} value={durationMin} onChange={(e) => setDurationMin(parseInt(e.target.value || "0", 10))} disabled={busy} />
        </Field>
      </div>
      <Field label="Weekdays">
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              disabled={busy}
              className={`h-8 rounded-md border px-2.5 font-mono text-[11px] uppercase tracking-widest ${
                weekdays.has(i)
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-border bg-bg-subtle text-fg-muted hover:border-fg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Band (optional)">
        <select
          value={band}
          onChange={(e) => setBand(e.target.value as typeof band)}
          disabled={busy}
          className="h-9 w-full rounded-md border border-border bg-bg px-2 text-fg sm:w-48"
        >
          <option value="">—</option>
          <option value="early">early</option>
          <option value="mid">mid</option>
          <option value="late">late</option>
        </select>
      </Field>
      {result ? (
        <p className="text-[12px] text-emerald-700 dark:text-emerald-300">
          Created {result.created} slot{result.created === 1 ? "" : "s"}, skipped {result.skipped} (already existed).
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-rose-700 dark:text-rose-300">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Done</Button>
        <Button
          onClick={async () => {
            if (!startDate || !endDate || weekdays.size === 0 || !startLocalTime) {
              setError("Pick start, end, at least one weekday, and a time.");
              return;
            }
            setBusy(true); setError(null); setResult(null);
            try {
              const res = await api.bulkIceSlots(surfaceId, {
                startDate, endDate,
                weekdays: [...weekdays].sort(),
                startLocalTime, durationMin, tz,
                ...(band ? { band: band } : {})
              });
              setResult(res);
              onCreated();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally { setBusy(false); }
          }}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          Generate slots
        </Button>
      </div>
    </div>
  );
}
