"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, ChevronDown, ChevronRight, Loader2, Pencil, Plus,
  Snowflake, Trash2, RefreshCw, X
} from "lucide-react";
import type { RinkAddress, RinkRemoval, RinkUsage } from "@sportspulse/api-client";
import { DATE_FORMATS, formatInZone, isValidTimeZone, utcToZonedWallTime } from "@sportspulse/kernel";
import { Alert, Badge, Button, EmptyState, Field, Input, Skeleton } from "@sportspulse/ui";
import { TIMEZONES } from "../org-setup/steps/league-step";

/**
 * Venue management — list venues, drill into a venue to manage
 * surfaces, drill into a surface to manage ice slots. Same component
 * mounts in sa-web and org-admin-web (consumer passes the API
 * namespace via props).
 *
 * Every row can be edited and removed (SCH-3): rename a rink, change its
 * time zone or address; rename a surface; change or delete a single ice
 * slot. Removing a rink or surface first asks the server what still uses
 * it: refused while a game there is not finished, archived when it has
 * history, deleted otherwise, and open slots go only after the admin
 * confirms. The server enforces the same rules and who may change rinks.
 */
interface Venue {
  id: string;
  orgId: string;
  name: string;
  timezone: string;
  surfacesCount: number;
  createdAt: string;
}

interface VenueDetail {
  id: string;
  orgId: string;
  name: string;
  timezone: string;
  address: Record<string, unknown>;
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

type Band = "early" | "mid" | "late";

/** The schedulingInventory namespace of @sportspulse/api-client. */
export interface VenuesApi {
  listVenues: (q?: { orgId?: string }) => Promise<{ items: Venue[] }>;
  getVenue: (id: string) => Promise<{ venue: VenueDetail; surfaces: Surface[] }>;
  createVenue: (body: { orgId: string; name: string; timezone?: string }) => Promise<{ id: string }>;
  updateVenue: (id: string, body: { name?: string; timezone?: string; address?: RinkAddress }) => Promise<unknown>;
  venueUsage: (id: string) => Promise<RinkUsage>;
  deleteVenue: (id: string, opts?: { removeOpenSlots?: boolean }) => Promise<RinkRemoval>;
  createSurface: (venueId: string, body: { label: string }) => Promise<{ id: string }>;
  updateSurface: (id: string, body: { label?: string }) => Promise<unknown>;
  surfaceUsage: (id: string) => Promise<RinkUsage>;
  deleteSurface: (id: string, opts?: { removeOpenSlots?: boolean }) => Promise<RinkRemoval>;
  listIceSlots: (surfaceId: string, q?: { fromTsUtc?: string; toTsUtc?: string }) => Promise<{ items: IceSlot[] }>;
  createIceSlot: (
    surfaceId: string,
    body: {
      seasonId: string;
      /** Rink-local "YYYY-MM-DDTHH:MM"; the server converts it in the venue's zone. */
      startLocal: string;
      durationMin: number;
      band?: Band;
      isPlayoffReservation?: boolean;
    }
  ) => Promise<{ id: string }>;
  bulkIceSlots: (
    surfaceId: string,
    body: {
      seasonId: string;
      startDate: string;
      endDate: string;
      weekdays: number[];
      startLocalTime: string;
      durationMin: number;
      band?: Band;
      isPlayoffReservation?: boolean;
    }
  ) => Promise<{ created: number; skipped: number }>;
  updateIceSlot: (
    id: string,
    body: {
      startLocal?: string;
      durationMin?: number;
      band?: Band | null;
      seasonId?: string | null;
      isPlayoffReservation?: boolean;
    }
  ) => Promise<unknown>;
  deleteIceSlot: (id: string) => Promise<{ ok: true }>;
}

export interface VenuesPageProps {
  api: VenuesApi;
  /** Org to scope the list. When omitted, super-admin sees all orgs. */
  orgId?: string;
  /**
   * Orgs the user can create venues in (for the org picker on create).
   * `timezone` is the org's default, used as the new rink's zone.
   */
  ownableOrgs?: Array<{ id: string; name: string; timezone?: string }>;
  /**
   * Seasons of an org, for the slot forms' Season picker. The scheduler
   * only reads slots tagged with the season it schedules, so untagged
   * slots were silently ignored (SCH-2).
   */
  loadSeasons: (orgId: string) => Promise<SeasonOption[]>;
}

export interface SeasonOption {
  id: string;
  name: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SELECT_CLASS = "h-9 w-full rounded-md border border-border bg-bg px-2 text-fg";
const ADDRESS_FIELDS: Array<{ key: keyof RinkAddress; label: string }> = [
  { key: "line1", label: "Street address" },
  { key: "line2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "region", label: "State / province" },
  { key: "postalCode", label: "Postal code" },
  { key: "countryCode", label: "Country code" }
];

/** A slot time as the rink's clocks read it: "Nov 4, 9:00 PM". */
function fmtSlotTime(iso: string, tz: string): string {
  return formatInZone(iso, tz, DATE_FORMATS.gameTime) || iso;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function VenuesPage({ api, orgId, ownableOrgs, loadSeasons }: VenuesPageProps) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listVenues(orgId ? { orgId } : undefined);
      setVenues(res.items);
    } catch (e) {
      setError(errorText(e));
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

      {notice ? <Alert tone="success" role="status">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading && venues.length === 0 ? (
        <div role="status" aria-label="Loading venues" className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
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
              loadSeasons={loadSeasons}
              isOpen={expanded === v.id}
              onToggle={() => setExpanded(expanded === v.id ? null : v.id)}
              onChange={() => void load()}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** IANA zone picker. The current value is always offered, even when unlisted. */
function TimeZoneSelect({
  id,
  value,
  onChange,
  disabled
}: {
  /** Set by the wrapping <Field> so its label names the select. */
  id?: string;
  value: string;
  onChange: (tz: string) => void;
  disabled?: boolean;
}) {
  const options = useMemo(
    () => [...new Set([...(value ? [value] : []), ...TIMEZONES])],
    [value]
  );
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={SELECT_CLASS}
    >
      {value ? null : <option value="">Pick a time zone</option>}
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz}{isValidTimeZone(tz) ? "" : " (not a real time zone)"}
        </option>
      ))}
    </select>
  );
}

function CreateVenueForm({
  api, defaultOrgId, ownableOrgs, onCancel, onCreated
}: {
  api: VenuesApi;
  defaultOrgId?: string;
  ownableOrgs?: Array<{ id: string; name: string; timezone?: string }>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  // Preselect only an organization that is certain: the one in view, or
  // the only one the admin has. With several, the admin picks (SETUP-16).
  const onlyOrg = ownableOrgs && ownableOrgs.length === 1 ? ownableOrgs[0]!.id : "";
  const [orgId, setOrgId] = useState(defaultOrgId ?? onlyOrg);
  const orgZone = (id: string) => ownableOrgs?.find((o) => o.id === id)?.timezone ?? "";
  // The organisation's own zone, not UTC: a wrong zone shifts every slot.
  const [timezone, setTimezone] = useState(orgZone(defaultOrgId ?? onlyOrg));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The org list often arrives after the form opens: take it then when
  // there is only one (SCH-9); with several the picker asks.
  useEffect(() => {
    if (!orgId && !defaultOrgId && ownableOrgs && ownableOrgs.length === 1) {
      setOrgId(ownableOrgs[0]!.id);
    }
  }, [orgId, defaultOrgId, ownableOrgs]);
  useEffect(() => {
    if (!timezone && orgId) setTimezone(orgZone(orgId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, ownableOrgs]);
  const orgsLoading = !defaultOrgId && (!ownableOrgs || ownableOrgs.length === 0);

  return (
    <div className="rounded-lg border border-border bg-bg p-4 space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">New rink</div>
      <div className="grid gap-3 sm:grid-cols-3">
        {!defaultOrgId && ownableOrgs && ownableOrgs.length > 0 ? (
          <Field label="Organization">
            <select
              value={orgId}
              onChange={(e) => { setOrgId(e.target.value); setTimezone(orgZone(e.target.value) || timezone); }}
              disabled={busy}
              className={SELECT_CLASS}
            >
              {orgId ? null : <option value="">Select an organization…</option>}
              {ownableOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        ) : orgsLoading ? (
          <Field label="Organization">
            <div role="status" aria-label="Loading organizations"><Skeleton className="h-9" /></div>
          </Field>
        ) : null}
        <Field label="Rink name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="QA Test Arena" disabled={busy} />
        </Field>
        <Field label="Timezone" hint="Slot and game times are typed in this zone.">
          <TimeZoneSelect value={timezone} onChange={setTimezone} disabled={busy} />
        </Field>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!orgId || !name.trim() || !timezone) {
              setError("Rink name, organisation and time zone are required.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await api.createVenue({ orgId, name: name.trim(), timezone });
              onCreated();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !name.trim() || !orgId || !timezone}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          Create
        </Button>
      </div>
    </div>
  );
}

function VenueRow({
  venue, api, loadSeasons, isOpen, onToggle, onChange, onNotice
}: {
  venue: Venue;
  api: VenuesApi;
  loadSeasons: (orgId: string) => Promise<SeasonOption[]>;
  isOpen: boolean;
  onToggle: () => void;
  onChange: () => void;
  onNotice: (message: string | null) => void;
}) {
  const [surfaces, setSurfaces] = useState<Surface[] | null>(null);
  const [detail, setDetail] = useState<VenueDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddSurface, setShowAddSurface] = useState(false);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [panel, setPanel] = useState<"edit" | "remove" | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadSeasons(venue.orgId).then(setSeasons).catch(() => setSeasons([]));
  }, [isOpen, loadSeasons, venue.orgId]);

  const loadDetail = useCallback(() => {
    setLoading(true);
    return api.getVenue(venue.id)
      .then((res) => { setSurfaces(res.surfaces); setDetail(res.venue); })
      .catch(() => setSurfaces([]))
      .finally(() => setLoading(false));
  }, [api, venue.id]);

  // Keyed on whether details are needed, not on the panel itself:
  // closing the remove panel of a just-archived rink must not re-fetch it.
  const needsDetail = isOpen || panel === "edit";
  useEffect(() => {
    if (needsDetail) void loadDetail();
  }, [needsDetail, loadDetail]);

  return (
    <li className="rounded-lg border border-border bg-surface-1">
      <div className="flex items-center gap-2 pr-3 hover:bg-bg-subtle">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3 text-left"
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Building2 className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          <div className="flex-1 min-w-0">
            <p className="truncate text-[13px] font-semibold text-fg">{venue.name}</p>
            <p className="truncate text-[11px] text-fg-muted">{venue.timezone}</p>
          </div>
          <Badge tone="neutral" mono>{venue.surfacesCount} surfaces</Badge>
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "edit" ? null : "edit")}
          className="text-fg-muted hover:text-fg"
          aria-label={`Edit venue ${venue.name}`}
          title="Edit rink"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "remove" ? null : "remove")}
          className="text-fg-muted hover:text-rose-700"
          aria-label={`Delete venue ${venue.name}`}
          title="Delete rink"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {panel === "edit" ? (
        <div className="border-t border-border p-4">
          {detail ? (
            <VenueEditForm
              venue={detail}
              api={api}
              onCancel={() => setPanel(null)}
              onSaved={(msg) => { setPanel(null); onNotice(msg); onChange(); void loadDetail(); }}
            />
          ) : (
            <div role="status" aria-label="Loading" className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          )}
        </div>
      ) : null}
      {panel === "remove" ? (
        <div className="border-t border-border p-4">
          <RemoveConfirm
            noun="rink"
            loadUsage={() => api.venueUsage(venue.id)}
            remove={(opts) => api.deleteVenue(venue.id, opts)}
            onCancel={() => setPanel(null)}
            onRemoved={(msg) => { setPanel(null); onNotice(msg); onChange(); }}
          />
        </div>
      ) : null}
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
              onCreated={() => { setShowAddSurface(false); onChange(); void loadDetail(); }}
            />
          ) : null}
          {loading && !surfaces ? (
            <div role="status" aria-label="Loading" className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : surfaces && surfaces.length === 0 ? (
            <EmptyState icon={Snowflake} eyebrow="surfaces" title="No surfaces yet" description="Add a surface above. Ice slots and games attach to a surface." />
          ) : (
            <ul className="space-y-2">
              {(surfaces ?? []).map((s) => (
                <SurfaceRow
                  key={s.id}
                  surface={s}
                  venueTz={venue.timezone}
                  seasons={seasons}
                  api={api}
                  onChange={() => { onChange(); void loadDetail(); }}
                  onNotice={onNotice}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function VenueEditForm({
  venue, api, onCancel, onSaved
}: {
  venue: VenueDetail;
  api: VenuesApi;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(venue.name);
  const [timezone, setTimezone] = useState(venue.timezone);
  const [address, setAddress] = useState<RinkAddress>(() => {
    const a: RinkAddress = {};
    for (const f of ADDRESS_FIELDS) {
      const v = venue.address?.[f.key];
      if (typeof v === "string") a[f.key] = v;
    }
    return a;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoneChanged = timezone !== venue.timezone;

  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Edit rink</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rink name">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={120} />
        </Field>
        <Field label="Timezone">
          <TimeZoneSelect value={timezone} onChange={setTimezone} disabled={busy} />
        </Field>
      </div>
      {zoneChanged ? (
        <Alert tone="warning" role="status">
          Ice slots and games already saved at this rink keep their time and zone. Only new slots and games use {timezone}.
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {ADDRESS_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              value={address[f.key] ?? ""}
              onChange={(e) => setAddress((a) => ({ ...a, [f.key]: e.target.value }))}
              disabled={busy}
            />
          </Field>
        ))}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!name.trim()) { setError("Give the rink a name."); return; }
            setBusy(true); setError(null);
            try {
              await api.updateVenue(venue.id, {
                name: name.trim(),
                ...(zoneChanged ? { timezone } : {}),
                address
              });
              onSaved(`Saved ${name.trim()}.`);
            } catch (e) {
              setError(errorText(e));
            } finally { setBusy(false); }
          }}
          disabled={busy || !name.trim() || !timezone}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          Save rink
        </Button>
      </div>
    </div>
  );
}

/**
 * Ask the server what removing a rink or surface would do, show it, and
 * act only on a clear confirm. Open slots from today on are removed only
 * because the admin saw the count here.
 */
function RemoveConfirm({
  noun, loadUsage, remove, onCancel, onRemoved
}: {
  noun: "rink" | "surface";
  loadUsage: () => Promise<RinkUsage>;
  remove: (opts: { removeOpenSlots?: boolean }) => Promise<RinkRemoval>;
  onCancel: () => void;
  onRemoved: (message: string) => void;
}) {
  const [usage, setUsage] = useState<RinkUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadUsage()
      .then((u) => { if (!cancelled) setUsage(u); })
      .catch((e) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!usage) {
    return error ? (
      <div className="space-y-2">
        <Alert tone="error">{error}</Alert>
        <div className="flex justify-end"><Button variant="secondary" onClick={onCancel}>Close</Button></div>
      </div>
    ) : (
      <p className="flex items-center gap-2 text-[12px] text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
        Checking what uses this {noun}…
      </p>
    );
  }

  const verb = usage.outcome === "archive" ? "Archive" : "Delete";
  return (
    <div className="space-y-3">
      <Alert tone={usage.outcome === "blocked" ? "error" : "warning"} role="status">
        {usage.message}
      </Alert>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {usage.outcome === "blocked" ? "Close" : "Cancel"}
        </Button>
        {usage.outcome !== "blocked" ? (
          <Button
            variant="destructive"
            onClick={async () => {
              setBusy(true); setError(null);
              try {
                const r = await remove({ removeOpenSlots: usage.openSlotsCount > 0 });
                const slots = r.removedSlots > 0 ? ` ${r.removedSlots} open ice slot${r.removedSlots === 1 ? "" : "s"} removed.` : "";
                onRemoved(`${usage.name} ${r.outcome}.${slots}`);
              } catch (e) {
                setError(errorText(e));
              } finally { setBusy(false); }
            }}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
            {verb} {noun}
          </Button>
        ) : null}
      </div>
    </div>
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
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!label.trim()) return;
            setBusy(true); setError(null);
            try { await api.createSurface(venueId, { label: label.trim() }); onCreated(); }
            catch (e) { setError(errorText(e)); }
            finally { setBusy(false); }
          }}
          disabled={busy || !label.trim()}
        >Create</Button>
      </div>
    </div>
  );
}

function SurfaceRow({
  surface, venueTz, seasons, api, onChange, onNotice
}: {
  surface: Surface;
  venueTz: string;
  seasons: SeasonOption[];
  api: VenuesApi;
  onChange: () => void;
  onNotice: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<IceSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState<"single" | "bulk" | null>(null);
  const [panel, setPanel] = useState<"rename" | "remove" | null>(null);
  const [label, setLabel] = useState(surface.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center gap-2 pr-3 hover:bg-bg-subtle">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Snowflake className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          <span className="flex-1 text-[13px] font-medium text-fg">{surface.label}</span>
          <Badge tone="neutral" mono>{surface.iceSlotsCount} slots</Badge>
        </button>
        <button
          type="button"
          onClick={() => { setLabel(surface.label); setError(null); setPanel(panel === "rename" ? null : "rename"); }}
          className="text-fg-muted hover:text-fg"
          aria-label={`Rename surface ${surface.label}`}
          title="Rename surface"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "remove" ? null : "remove")}
          className="text-fg-muted hover:text-rose-700"
          aria-label={`Delete surface ${surface.label}`}
          title="Delete surface"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {panel === "rename" ? (
        <div className="border-t border-border p-3 space-y-2">
          <Field label="Surface label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} maxLength={60} autoFocus />
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPanel(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={async () => {
                setBusy(true); setError(null);
                try {
                  await api.updateSurface(surface.id, { label: label.trim() });
                  setPanel(null);
                  onNotice(`Renamed to ${label.trim()}.`);
                  onChange();
                } catch (e) { setError(errorText(e)); }
                finally { setBusy(false); }
              }}
              disabled={busy || !label.trim() || label.trim() === surface.label}
            >Save surface</Button>
          </div>
        </div>
      ) : null}
      {panel === "remove" ? (
        <div className="border-t border-border p-3">
          <RemoveConfirm
            noun="surface"
            loadUsage={() => api.surfaceUsage(surface.id)}
            remove={(opts) => api.deleteSurface(surface.id, opts)}
            onCancel={() => setPanel(null)}
            onRemoved={(msg) => { setPanel(null); onNotice(msg); onChange(); }}
          />
        </div>
      ) : null}
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
              seasons={seasons}
              onCancel={() => setShowAdd(null)}
              onCreated={() => { setShowAdd(null); loadSlots(); onChange(); }}
            />
          ) : null}
          {showAdd === "bulk" ? (
            <BulkSlotForm
              api={api}
              surfaceId={surface.id}
              tz={venueTz}
              seasons={seasons}
              onCancel={() => setShowAdd(null)}
              onCreated={() => { setShowAdd(null); loadSlots(); onChange(); }}
            />
          ) : null}
          {loading && !slots ? (
            <div role="status" aria-label="Loading" className="space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : !slots || slots.length === 0 ? (
            <EmptyState icon={Snowflake} eyebrow="ice slots" title="No ice slots yet" description="Add a weekly recurrence to fill a season quickly." />
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {slots.map((s) => (
                <SlotRow
                  key={s.id}
                  slot={s}
                  venueTz={venueTz}
                  seasons={seasons}
                  api={api}
                  onChange={() => { loadSlots(); onChange(); }}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function SlotRow({
  slot, venueTz, seasons, api, onChange
}: {
  slot: IceSlot;
  venueTz: string;
  seasons: SeasonOption[];
  api: VenuesApi;
  onChange: () => void;
}) {
  // The slot's own zone; older rows may carry a bad one.
  const tz = isValidTimeZone(slot.tz) ? slot.tz : isValidTimeZone(venueTz) ? venueTz : "UTC";
  const when = fmtSlotTime(slot.startTsUtc, tz);
  const seasonName = seasons.find((x) => x.id === slot.seasonId)?.name;
  const [panel, setPanel] = useState<"edit" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="rounded border border-border bg-surface-1 text-[12px]">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-fg">{when}</span>
          <span className="text-fg-muted">· {slot.durationMin}min</span>
          {seasonName ? <span className="truncate text-fg-muted">· {seasonName}</span> : null}
          {slot.band ? <Badge tone="neutral" mono>{slot.band}</Badge> : null}
          {slot.isPlayoffReservation ? <Badge tone="warning" mono>playoff</Badge> : null}
          {slot.status !== "available" ? <Badge status={slot.status} /> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setError(null); setPanel(panel === "edit" ? null : "edit"); }}
            className="text-fg-muted hover:text-fg"
            aria-label={`Edit slot ${when}`}
            title="Edit slot"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => { setError(null); setPanel(panel === "delete" ? null : "delete"); }}
            className="text-fg-muted hover:text-rose-700"
            aria-label={`Delete slot ${when}`}
            title="Delete slot"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {panel === "edit" ? (
        <div className="border-t border-border p-3">
          <SlotEditForm
            slot={slot}
            tz={tz}
            seasons={seasons}
            api={api}
            onCancel={() => setPanel(null)}
            onSaved={() => { setPanel(null); onChange(); }}
          />
        </div>
      ) : null}
      {panel === "delete" ? (
        <div className="border-t border-border p-3 space-y-2">
          <p className="text-fg">Delete the {when} slot?</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)} disabled={busy}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                setBusy(true); setError(null);
                try {
                  await api.deleteIceSlot(slot.id);
                  setPanel(null);
                  onChange();
                } catch (e) { setError(errorText(e)); }
                finally { setBusy(false); }
              }}
              disabled={busy}
            >Delete slot</Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function SlotEditForm({
  slot, tz, seasons, api, onCancel, onSaved
}: {
  slot: IceSlot;
  tz: string;
  seasons: SeasonOption[];
  api: VenuesApi;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initialStart = utcToZonedWallTime(slot.startTsUtc, tz);
  const [startLocal, setStartLocal] = useState(initialStart);
  const [durationMin, setDurationMin] = useState(slot.durationMin);
  const [band, setBand] = useState<"" | Band>((slot.band as Band | null) ?? "");
  const [seasonId, setSeasonId] = useState(slot.seasonId ?? "");
  const [playoff, setPlayoff] = useState(slot.isPlayoffReservation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <SeasonField seasons={seasons} value={seasonId} onChange={setSeasonId} disabled={busy} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`Start (${tz})`}>
          <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} disabled={busy} />
        </Field>
        <Field label="Duration (min)">
          <Input type="number" min={15} max={360} value={durationMin} onChange={(e) => setDurationMin(parseInt(e.target.value || "0", 10))} disabled={busy} />
        </Field>
        <BandField value={band} onChange={setBand} disabled={busy} />
      </div>
      <PlayoffField checked={playoff} onChange={setPlayoff} disabled={busy} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!startLocal) { setError("Pick the date and start time."); return; }
            setBusy(true); setError(null);
            try {
              await api.updateIceSlot(slot.id, {
                ...(startLocal !== initialStart ? { startLocal } : {}),
                durationMin,
                band: band || null,
                seasonId: seasonId || null,
                isPlayoffReservation: playoff
              });
              onSaved();
            } catch (e) {
              setError(errorText(e));
            } finally { setBusy(false); }
          }}
          disabled={busy || !startLocal}
        >Save slot</Button>
      </div>
    </div>
  );
}

function BandField({
  value, onChange, disabled, label = "Band"
}: {
  value: "" | Band;
  onChange: (b: "" | Band) => void;
  disabled: boolean;
  label?: string;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "" | Band)}
        disabled={disabled}
        className={SELECT_CLASS}
      >
        <option value="">—</option>
        <option value="early">early</option>
        <option value="mid">mid</option>
        <option value="late">late</option>
      </select>
    </Field>
  );
}

function PlayoffField({
  checked, onChange, disabled
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-[12px] text-fg">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        Playoff ice
        <span className="block text-fg-muted">Held for playoffs. Regular-season scheduling skips it.</span>
      </span>
    </label>
  );
}

function SingleSlotForm({
  api, surfaceId, tz, seasons, onCancel, onCreated
}: {
  api: VenuesApi;
  surfaceId: string;
  tz: string;
  seasons: SeasonOption[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [seasonId, setSeasonId] = useState(seasons.length === 1 ? seasons[0]!.id : "");
  const [startLocal, setStartLocal] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [band, setBand] = useState<"" | Band>("");
  const [playoff, setPlayoff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-md border border-border bg-bg p-3 space-y-2">
      <SeasonField seasons={seasons} value={seasonId} onChange={setSeasonId} disabled={busy} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Start (local)" hint={`Rink time (${tz}).`}>
          <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} disabled={busy} />
        </Field>
        <Field label="Duration (min)">
          <Input type="number" min={15} max={360} value={durationMin} onChange={(e) => setDurationMin(parseInt(e.target.value || "0", 10))} disabled={busy} />
        </Field>
        <BandField value={band} onChange={setBand} disabled={busy} />
      </div>
      <PlayoffField checked={playoff} onChange={setPlayoff} disabled={busy} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          onClick={async () => {
            if (!startLocal) return;
            setBusy(true); setError(null);
            try {
              // Rink-local time; the server converts it in the venue's
              // zone, so the browser's own zone never shifts the slot.
              await api.createIceSlot(surfaceId, {
                seasonId,
                startLocal,
                durationMin,
                ...(band ? { band } : {}),
                ...(playoff ? { isPlayoffReservation: true } : {})
              });
              onCreated();
            } catch (e) {
              setError(errorText(e));
            } finally { setBusy(false); }
          }}
          disabled={busy || !startLocal || !seasonId}
        >Create slot</Button>
      </div>
    </div>
  );
}

function BulkSlotForm({
  api, surfaceId, tz, seasons, onCancel, onCreated
}: {
  api: VenuesApi;
  surfaceId: string;
  tz: string;
  seasons: SeasonOption[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [seasonId, setSeasonId] = useState(seasons.length === 1 ? seasons[0]!.id : "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startLocalTime, setStartLocalTime] = useState("19:00");
  const [durationMin, setDurationMin] = useState(60);
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([1, 3, 5]));
  const [band, setBand] = useState<"" | Band>("");
  const [playoff, setPlayoff] = useState(false);
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
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Weekly recurrence</p>
      <SeasonField seasons={seasons} value={seasonId} onChange={setSeasonId} disabled={busy} />
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
      <div className="grid gap-3 sm:grid-cols-4">
        <BandField value={band} onChange={setBand} disabled={busy} label="Band (optional)" />
      </div>
      <PlayoffField checked={playoff} onChange={setPlayoff} disabled={busy} />
      {result ? (
        <Alert tone="success" role="status">
          Created {result.created} slot{result.created === 1 ? "" : "s"}, skipped {result.skipped} (already existed).
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Done</Button>
        <Button
          onClick={async () => {
            if (!seasonId || !startDate || !endDate || weekdays.size === 0 || !startLocalTime) {
              setError("Pick a season, start, end, at least one weekday, and a time.");
              return;
            }
            setBusy(true); setError(null); setResult(null);
            try {
              const res = await api.bulkIceSlots(surfaceId, {
                seasonId,
                startDate, endDate,
                weekdays: [...weekdays].sort(),
                startLocalTime, durationMin,
                ...(band ? { band } : {}),
                ...(playoff ? { isPlayoffReservation: true } : {})
              });
              setResult(res);
              onCreated();
            } catch (e) {
              setError(errorText(e));
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

function SeasonField({
  seasons, value, onChange, disabled
}: {
  seasons: SeasonOption[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <Field
      label="Season"
      hint={seasons.length === 0 ? "This venue's organisation has no seasons yet. Create one first." : "The scheduler only uses slots tagged with its season."}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || seasons.length === 0}
        className="h-9 w-full rounded-md border border-border bg-bg px-2 text-fg sm:w-72"
      >
        <option value="">Pick a season</option>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </Field>
  );
}
